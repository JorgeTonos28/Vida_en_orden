import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { testDatabase } from "./helpers/d1.ts";
import { syntheticQaAuthorizer } from "./helpers/qa-authorization.ts";
import { ProposalEngine } from "../lib/mcp/plans/engine.ts";
import { actionRegistry } from "../lib/mcp/plans/catalog.ts";
import { domainDatabase } from "../lib/domain/context.ts";
import { HOUSEHOLD_SCOPE } from "../lib/data-scopes.ts";
import { stageSql } from "../lib/mcp/plans/staging.ts";
import { createMcpReadService } from "../lib/mcp/read-service.ts";
import type { ActionRegistry, ApprovalVerifier, PlanAction } from "../lib/mcp/plans/types.ts";

const actor={userId:"synthetic-review-owner",email:"owner@example.test",fullName:null};
const now=()=>new Date();
const verifier:ApprovalVerifier={channel:"isolated-test",async verify(proof,challenge){if(proof!==challenge)throw Error("Synthetic proof denied");return {credentialId:"synthetic-key"};}};
const task=(title="Synthetic review task"):PlanAction[]=>[{actionId:"t",kind:"task.create",input:{title}}];
function fixture(registry:ActionRegistry=actionRegistry){
 const f=testDatabase(),engine=new ProposalEngine(f.database,{actor,registry,verifier,executionEnabled:true,authorizeExecution:syntheticQaAuthorizer(f.database,actor,registry),now});
 const approve=async(id:string)=>{const c=await engine.requestApproval(id);return engine.approve(id,c.challenge,c.challenge);};
 const metadata=(id:string)=>JSON.stringify(["mcp_proposal_heads","mcp_proposals","mcp_approvals","mcp_approval_challenges","mcp_approval_evidence","mcp_plan_audit"].map(table=>f.sqlite.prepare(`SELECT * FROM ${table} WHERE proposal_id=? ORDER BY rowid`).all(id)));
 return {...f,engine,approve,metadata};
}

test("revisión inválida conserva head, APPROVED, aprobación/evidencia/nonce y autorización utilizable",async()=>{
 for(const input of [[],[{...task()[0],kind:"unsupported"}],task("")]){
  const f=fixture();try{
   const old=await f.engine.prepare(task());await f.approve(old.proposalId);const before=f.metadata(old.proposalId);
   await assert.rejects(()=>f.engine.revise(old.proposalId,input,1));assert.equal(f.metadata(old.proposalId),before);
   assert.equal((await f.engine.commit(old.proposalId,1,old.digest,"preserved-approval")).state,"COMMITTED");
  }finally{f.close();}
 }
});

for(const failure of ["staging","publication","publication-audit"]){
 test(`fallo de ${failure} al revisar APPROVED revierte la sustitución completa`,async()=>{
  const f=fixture();try{
   const old=await f.engine.prepare(task());await f.approve(old.proposalId);const before=f.metadata(old.proposalId);
   f.failWhen(sql=>failure==="staging"?sql.startsWith("INSERT INTO mcp_stage_home_tasks"):failure==="publication"?sql.startsWith("INSERT INTO mcp_proposals("):sql.includes("'prepared'"));
   await assert.rejects(()=>f.engine.revise(old.proposalId,task("Synthetic revised"),1));f.failWhen();
   assert.equal(f.metadata(old.proposalId),before);
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM mcp_stage_leases").get()?.n,0);
   assert.equal((await f.engine.commit(old.proposalId,1,old.digest,"preserved-after-failure")).state,"COMMITTED");
  }finally{f.close();}
 });
}

test("publicar revisión válida invalida estado/nonce/autorización antiguos y conserva evidencia histórica",async()=>{
 const f=fixture();try{
  const old=await f.engine.prepare(task());await f.approve(old.proposalId);
  const revised=await f.engine.revise(old.proposalId,task("Synthetic revision two"),1);
  assert.equal(revised.revision,2);assert.equal((await f.engine.get(old.proposalId,1)).state,"INVALIDATED");
  assert.equal((await f.engine.get(old.proposalId)).state,"VALIDATED");
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM mcp_approvals WHERE proposal_id=?").get(old.proposalId)?.n,0);
  assert.equal(f.sqlite.prepare("SELECT used FROM mcp_approval_challenges WHERE proposal_id=? AND revision=1").get(old.proposalId)?.used,1);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM mcp_approval_evidence WHERE proposal_id=? AND revision=1").get(old.proposalId)?.n,1);
  await assert.rejects(()=>f.engine.commit(revised.proposalId,2,revised.digest,"no-fresh-approval"),{code:"approval_required"});
 }finally{f.close();}
});

function pausedRegistry(){
 let start!:()=>void,release!:()=>void;
 const started=new Promise<void>(resolve=>{start=resolve;}),ready=new Promise<void>(resolve=>{release=resolve;});
 const original=actionRegistry.get("task.create")!,registry=new Map(actionRegistry);
 registry.set("test.paused",{...original,kind:"test.paused",async execute(a,input){start();await ready;return original.execute(a,input);}});
 return {registry,started,release,input:[{...task()[0],kind:"test.paused"}]};
}
for(const winner of ["commit","cancel","approve"] as const){
 test(`preparación en curso conserva la versión vigente y no sobrescribe ${winner} concurrente`,async()=>{
  const pause=pausedRegistry(),f=fixture(pause.registry);let pending:Promise<unknown>|undefined;
  try{
   const old=await f.engine.prepare(task());const challenge=await f.engine.requestApproval(old.proposalId);
   if(winner!=="approve")await f.engine.approve(old.proposalId,challenge.challenge,challenge.challenge);
   pending=f.engine.revise(old.proposalId,pause.input,1);const outcome=pending.then(value=>({value,error:undefined}),error=>({value:undefined,error}));
   await pause.started;assert.equal((await f.engine.get(old.proposalId)).state,winner==="approve"?"PENDING_APPROVAL":"APPROVED");
   if(winner==="commit")await f.engine.commit(old.proposalId,1,old.digest,"concurrent-winner");
   else if(winner==="cancel")await f.engine.cancel(old.proposalId,1);
   else await f.engine.approve(old.proposalId,challenge.challenge,challenge.challenge);
   pause.release();assert.equal((await outcome).error?.code,"stale_proposal");
   assert.equal((await f.engine.get(old.proposalId)).state,winner==="commit"?"COMMITTED":winner==="cancel"?"CANCELLED":"APPROVED");
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM mcp_proposals WHERE proposal_id=?").get(old.proposalId)?.n,1);
  }finally{pause.release();await pending?.catch(()=>undefined);f.close();}
 });
}

test("dos revisiones de la misma base publican una sola sucesora mediante CAS",async()=>{
 const f=fixture();try{
  const old=await f.engine.prepare(task());await f.approve(old.proposalId);
  const outcomes=await Promise.allSettled([f.engine.revise(old.proposalId,task("Synthetic A"),1),f.engine.revise(old.proposalId,task("Synthetic B"),1)]);
  assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(outcomes.filter(r=>r.status==="rejected"&&r.reason.code==="stale_proposal").length,1);
  assert.equal((await f.engine.get(old.proposalId)).revision,2);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM mcp_proposals WHERE proposal_id=?").get(old.proposalId)?.n,2);
 }finally{f.close();}
});

for(const valid of [false,true]){
 test(`fallo de limpieza no oculta ${valid?"la publicación confirmada":"el error original de validación"}`,async()=>{
  const f=fixture();try{
   const old=await f.engine.prepare(task());await f.approve(old.proposalId);const before=f.metadata(old.proposalId);
   f.failWhen(sql=>sql.startsWith("DELETE FROM mcp_stage_"));
   if(valid){const revised=await f.engine.revise(old.proposalId,task("Synthetic cleanup recovery"),1);assert.equal(revised.revision,2);assert.equal((await f.engine.get(old.proposalId)).state,"VALIDATED");}
   else{await assert.rejects(()=>f.engine.revise(old.proposalId,task(""),1),{code:"invalid_input"});assert.equal(f.metadata(old.proposalId),before);}
   f.failWhen();assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM mcp_stage_leases").get()?.n,1);
   f.sqlite.exec("UPDATE mcp_stage_leases SET expires_at=0");assert.equal((await f.engine.maintenance()).expiredStagesRemoved,1);
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM mcp_stage_leases").get()?.n,0);
  }finally{f.close();}
 });
}

for(const seeded of [false,true]){
 test(`historial de 5.000 auditorías no bloquea finanzas ni pierde registros (marcador previo=${seeded})`,async()=>{
  let observedContext=-1;const registry=new Map(actionRegistry),original=registry.get("finance.account.create")!;
  registry.set(original.kind,{...original,async execute(a,input){observedContext=(await domainDatabase().prepare("SELECT * FROM audit_log WHERE owner_id=? ORDER BY occurred_at DESC LIMIT 100").bind(a.userId).all()).results.length;return original.execute(a,input);}});
  const f=fixture(registry);try{
   const insert=f.sqlite.prepare("INSERT INTO audit_log(id,owner_id,entity_type,entity_id,action,metadata,occurred_at) VALUES(?,?,?,?,?,?,?)");
   f.sqlite.exec("BEGIN");for(let i=0;i<5000;i++)insert.run(`synthetic-history-${i}`,actor.userId,"task","synthetic-entity","updated",JSON.stringify({synthetic:"x".repeat(1024)}),"2026-11-23");f.sqlite.exec("COMMIT");
   if(seeded)insert.run("synthetic-seed",actor.userId,"system","concepts-v1","seeded","{}","2020-01-01");
   insert.run("synthetic-other-seed","synthetic-other-owner","system","concepts-v1","seeded","{}","2020-01-01");
   const history=()=>JSON.stringify(f.sqlite.prepare("SELECT * FROM audit_log WHERE id GLOB 'synthetic-*' ORDER BY id").all());const before=history();
   const plan=await f.engine.prepare([{actionId:"a",kind:"finance.account.create",input:{name:"Synthetic large-history account",type:"cash",openingBalanceMinor:1000,openingBalanceDate:"2026-11-24"}}]);
   assert.equal(observedContext,seeded?1:0);assert.equal(history(),before);
   const additions=plan.payload.changes.filter(c=>c.table==="audit_log");assert.ok(additions.length>0);assert.ok(additions.every(c=>c.before===null&&c.after!==null));
   assert.equal(additions.filter(c=>c.after?.action==="seeded").length,seeded?0:1);
   await f.approve(plan.proposalId);await f.engine.commit(plan.proposalId,1,plan.digest,"large-history-commit");assert.equal(history(),before);
   assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_log WHERE owner_id=?").get(actor.userId)?.n,5000+Number(seeded)+additions.length+1);
   const report=await createMcpReadService(f.database,actor).listAuditLog({limit:2}) as {items:unknown[];page:{total:number}};assert.equal(report.items.length,2);assert.ok(report.page.total>5000);
   const lookup=f.sqlite.prepare("EXPLAIN QUERY PLAN SELECT id FROM audit_log WHERE owner_id=? AND entity_type='system' AND entity_id='concepts-v1' AND action='seeded' ORDER BY id LIMIT 1").all(actor.userId);assert.match(JSON.stringify(lookup),/audit_log_seed_context_idx/);
  }finally{f.close();}
 });
}

test("límite sigue siendo 2.000 filas no auditadas y no trunca estado para aceptar 2.001",async()=>{
 const f=fixture();try{
  const insert=f.sqlite.prepare("INSERT INTO home_tasks(id,user_id,title,created_at,updated_at) VALUES(?,?,?,?,?)");
  f.sqlite.exec("BEGIN");for(let i=0;i<2000;i++)insert.run(`synthetic-limit-${i}`,HOUSEHOLD_SCOPE,"Synthetic task","2026-11-24","2026-11-24");f.sqlite.exec("COMMIT");
  f.sqlite.prepare("INSERT INTO audit_log VALUES(?,?, 'system','concepts-v1','seeded','{}','2020-01-01')").run("synthetic-seed",actor.userId);
  await f.engine.prepare(task());
  insert.run("synthetic-limit-extra",HOUSEHOLD_SCOPE,"Synthetic extra","2026-11-24","2026-11-24");
  await assert.rejects(()=>f.engine.prepare(task()),{code:"snapshot_limit"});assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM mcp_stage_leases").get()?.n,0);
 }finally{f.close();}
});

test("contexto parcial de auditoría solo admite inserts y las dos lecturas de dominio conocidas",()=>{
 const id="00000000-0000-4000-8000-000000000000";
 for(const sql of ["DELETE FROM audit_log WHERE owner_id=?","UPDATE audit_log SET metadata=? WHERE owner_id=?","SELECT COUNT(*) FROM audit_log WHERE owner_id=?"]){assert.throws(()=>stageSql(sql,id),/audit/i);}
});

test("upgrade 0011→0012 añade solo índice, conserva historial y falla cerrado si falta migración",async()=>{
 const f=testDatabase(11);try{
  const insert=f.sqlite.prepare("INSERT INTO audit_log VALUES(?,?,'task','synthetic','updated','{}','2020-01-01')");
  f.sqlite.exec("BEGIN");for(let i=0;i<2500;i++)insert.run("synthetic-upgrade-"+i,actor.userId);f.sqlite.exec("COMMIT");
  const history=JSON.stringify(f.sqlite.prepare("SELECT * FROM audit_log ORDER BY id").all()),metadata=f.sqlite.prepare("SELECT * FROM mcp_installation").get();
  const engine=new ProposalEngine(f.database,{actor,registry:actionRegistry,verifier,executionEnabled:false,now});
  await assert.rejects(()=>engine.prepare(task()),{code:"migration_required"});assert.deepEqual(f.sqlite.prepare("SELECT * FROM mcp_installation").get(),metadata);
  f.sqlite.exec(readFileSync(new URL("../drizzle/0012_mcp_audit_context_index.sql",import.meta.url),"utf8"));
  assert.equal(JSON.stringify(f.sqlite.prepare("SELECT * FROM audit_log ORDER BY id").all()),history);
  assert.deepEqual(f.sqlite.prepare("SELECT * FROM mcp_installation").get(),metadata);
  await engine.prepare(task());const health=await engine.health();assert.equal(health.limits.rows,2000);assert.equal(health.limits.auditContextRows,1);assert.equal(health.limits.auditHistoryIncluded,false);assert.equal(health.limits.rowLimitScope,"non_audit_source_rows");
  assert.equal(JSON.stringify(f.sqlite.prepare("SELECT * FROM audit_log ORDER BY id").all()),history);
 }finally{f.close();}
});
