import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";
import { ProposalEngine } from "../lib/mcp/plans/engine.ts";
import { syntheticQaAuthorizer } from "./helpers/qa-authorization.ts";
import { actionRegistry } from "../lib/mcp/plans/catalog.ts";
import type { PlatformProxy } from "wrangler";

test("D1 local de workerd: migraciones, aprobación, idempotencia y rollback real de batch",async()=>{
 const root=mkdtempSync(join(tmpdir(),"veo-d1-runtime-")),config=join(root,"wrangler.json");let proxy:PlatformProxy<{DB:D1Database}>|undefined;
 try{
  writeFileSync(config,JSON.stringify({name:"veo-isolated-runtime",compatibility_date:"2026-05-15",compatibility_flags:["nodejs_compat"],d1_databases:[{binding:"DB",database_name:"synthetic-db",database_id:"00000000-0000-4000-8000-000000000000"}]}));
  proxy=await getPlatformProxy<{DB:D1Database}>({configPath:config,envFiles:[],persist:false,remoteBindings:false});const db=proxy.env.DB;
  const files=readdirSync(new URL("../drizzle/",import.meta.url)).filter(file=>/^\d{4}.*\.sql$/.test(file)).sort();
  for(const file of files){const statements=unstable_splitSqlQuery(readFileSync(new URL("../drizzle/"+file,import.meta.url),"utf8"));await db.batch(statements.map(sql=>db.prepare(sql)));}
  const actor={userId:"synthetic-runtime-owner",email:"owner@example.test",fullName:null};
  const engine=new ProposalEngine(db,{actor,registry:actionRegistry,executionEnabled:true,authorizeExecution:syntheticQaAuthorizer(db,actor,actionRegistry),verifier:{channel:"isolated-test",async verify(proof,challenge){if(proof!==challenge)throw Error("Test denied");return {credentialId:"synthetic-key"};}}});
  const actions=[{actionId:"t",kind:"task.create",input:{title:"Synthetic runtime task"}}];
  const approve=async(id:string)=>{const c=await engine.requestApproval(id);await engine.approve(id,c.challenge,c.challenge);};
  const p=await engine.prepare(actions);assert.equal((await db.prepare("SELECT COUNT(*) n FROM home_tasks").first<{n:number}>())?.n,0);await approve(p.proposalId);
  const receipt=await engine.commit(p.proposalId,1,p.digest,"one");assert.deepEqual(await engine.commit(p.proposalId,1,p.digest,"one"),receipt);
  const next=await engine.prepare(actions);await approve(next.proposalId);
  await db.exec("CREATE TRIGGER synthetic_receipt_failure BEFORE INSERT ON mcp_executions BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
  await assert.rejects(()=>engine.commit(next.proposalId,1,next.digest,"two"));assert.equal((await db.prepare("SELECT COUNT(*) n FROM home_tasks").first<{n:number}>())?.n,1);assert.equal((await engine.get(next.proposalId)).state,"APPROVED");
  await db.exec("DROP TRIGGER synthetic_receipt_failure;");await engine.commit(next.proposalId,1,next.digest,"two");assert.equal((await db.prepare("SELECT COUNT(*) n FROM home_tasks").first<{n:number}>())?.n,2);
  assert.equal((await engine.verifyExecution(next.proposalId,1)).stillMatches,true);
  // Real D1 rollback, including a failure after the new revision and revocation.
  const reviewed=await engine.prepare(actions);await approve(reviewed.proposalId);
  await assert.rejects(()=>engine.revise(reviewed.proposalId,[{...actions[0],input:{title:""}}],1),{code:"invalid_input"});
  assert.equal((await engine.get(reviewed.proposalId)).state,"APPROVED");
  await db.exec("CREATE TRIGGER synthetic_revision_failure BEFORE DELETE ON mcp_execution_guards WHEN EXISTS(SELECT 1 FROM mcp_proposal_heads WHERE revision=2) BEGIN SELECT RAISE(ABORT,'synthetic revision failure after head update'); END;");
  await assert.rejects(()=>engine.revise(reviewed.proposalId,actions,1));
  assert.equal((await engine.get(reviewed.proposalId)).state,"APPROVED");
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM mcp_approvals WHERE proposal_id=?").bind(reviewed.proposalId).first<{n:number}>())?.n,1);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM mcp_proposals WHERE proposal_id=?").bind(reviewed.proposalId).first<{n:number}>())?.n,1);
  await db.exec("DROP TRIGGER synthetic_revision_failure;");
  assert.equal((await engine.revise(reviewed.proposalId,actions,1)).revision,2);
  assert.equal((await engine.get(reviewed.proposalId,1)).state,"INVALIDATED");
  // A large, fictitious audit history remains in D1; only seed context is staged.
  await db.exec("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO audit_log(id,owner_id,entity_type,entity_id,action,metadata,occurred_at) SELECT 'synthetic-history-'||x,'synthetic-runtime-owner','task','synthetic','updated','{}','2020-01-01' FROM n;");
  await engine.prepare([{actionId:"a",kind:"finance.account.create",input:{name:"Synthetic history account",type:"cash",openingBalanceMinor:0,openingBalanceDate:"2026-11-24"}}]);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit_log WHERE id LIKE 'synthetic-history-%'").first<{n:number}>())?.n,5000);
 }finally{
  await proxy?.dispose();const target=resolve(root);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes("veo-d1-runtime-"));rmSync(target,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
});
