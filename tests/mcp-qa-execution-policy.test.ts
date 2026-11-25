import assert from "node:assert/strict";
import test from "node:test";
import { authorizeQaExecution, executionCatalogDigest, qaExecutionChallenge, QA_EXECUTION_RELEASE_ID, MAX_QA_PERMIT_MS, type QaExecutionGrant } from "../lib/mcp/plans/qa-execution-policy.ts";
import { MCP_BUSINESS_WRITES_ENABLED } from "../lib/mcp/future-contracts.ts";
import { runtimeProposalEngine } from "../lib/mcp/plans/runtime.ts";
import { ProposalEngine } from "../lib/mcp/plans/engine.ts";
import { webAuthnVerifier } from "../lib/mcp/plans/approval.ts";
import { actionRegistry } from "../lib/mcp/plans/catalog.ts";
import { testDatabase } from "./helpers/d1.ts";
import { credential } from "./helpers/webauthn.ts";

const actor={userId:"synthetic-qa-owner",email:"owner@example.test",fullName:null},origin="https://approval.example.test";
const releaseId="a".repeat(40),context={projectId:"synthetic-qa-project",origin,releaseId};
async function fixture(){
 const key=credential(actor.userId),now=Date.now();
 const grant:QaExecutionGrant={audience:"vida-en-orden/qa-execution/v1",dataClass:"synthetic-qa",projectId:context.projectId,origin,ownerId:actor.userId,installationId:"synthetic-installation",releaseId,catalogDigest:await executionCatalogDigest(actionRegistry),issuedAt:now-1000,expiresAt:now+60_000,nonce:"synthetic-nonce-"+"x".repeat(32)};
 const sign=async(g=grant,flags=5)=>JSON.stringify({grant:g,proof:key.assertion(await qaExecutionChallenge(g),origin,flags)});
 const input={context,actor,installation:{installation_id:grant.installationId,metadata_version:1},approvalOrigin:origin,credentials:[key.pin],registry:actionRegistry,now};
 return {key,grant,sign,input};
}
const deny={code:"writes_disabled"};

test("a valid owner WebAuthn permit is bound and produces only a private audit fingerprint",async()=>{
 const f=await fixture(),serializedPermit=await f.sign();const result=await authorizeQaExecution({...f.input,serializedPermit});
 assert.equal(result.expiresAt,f.grant.expiresAt);assert.equal(result.releaseId,releaseId);assert.match(result.permitDigest,/^[a-f0-9]{64}$/);
});
test("copying a signed permit to another Site, owner, D1, origin or release is denied",async()=>{
 const f=await fixture(),serializedPermit=await f.sign();
 for(const changed of [{context:{...context,projectId:"synthetic-other-site"}},{actor:{...actor,userId:"synthetic-other-owner"}},{installation:{installation_id:"synthetic-other-db",metadata_version:1}},{context:{...context,origin:"https://other.example.test"}},{context:{...context,releaseId:"b".repeat(40)}},{context:{...context,releaseId:null}},{installation:null},{approvalOrigin:"https://other.example.test"}]){
  await assert.rejects(async()=>authorizeQaExecution({...f.input,...changed,serializedPermit}),deny);
 }
});
test("tampering, missing pin, user verification, catalog drift and proposal-proof replay are denied",async()=>{
 const f=await fixture(),serializedPermit=await f.sign();const envelope=JSON.parse(serializedPermit);envelope.grant.nonce="tampered-"+"y".repeat(32);
 await assert.rejects(async()=>authorizeQaExecution({...f.input,serializedPermit:JSON.stringify(envelope)}),deny);
 await assert.rejects(async()=>authorizeQaExecution({...f.input,credentials:[],serializedPermit}),deny);
 await assert.rejects(async()=>authorizeQaExecution({...f.input,serializedPermit:await f.sign(f.grant,1)}),deny);
 await assert.rejects(async()=>authorizeQaExecution({...f.input,serializedPermit:await f.sign(f.grant,4)}),deny);
 await assert.rejects(async()=>authorizeQaExecution({...f.input,registry:new Map(),serializedPermit}),deny);
 await assert.rejects(async()=>authorizeQaExecution({...f.input,serializedPermit:JSON.stringify({grant:f.grant,proof:f.key.assertion("synthetic-proposal-challenge")})}),deny);
});
test("future, expired, overlong, malformed and unsolicited permit values fail closed",async()=>{
 const f=await fixture();for(const grant of [{...f.grant,issuedAt:f.input.now+1},{...f.grant,expiresAt:f.input.now},{...f.grant,issuedAt:f.input.now-1000,expiresAt:f.input.now+MAX_QA_PERMIT_MS}]){
  await assert.rejects(async()=>authorizeQaExecution({...f.input,serializedPermit:await f.sign(grant)}),deny);
 }
 for(const serializedPermit of [undefined,"true","{}","x".repeat(25*1024)])await assert.rejects(async()=>authorizeQaExecution({...f.input,serializedPermit}),deny);
});
test("the shared runtime remains closed even with a valid synthetic administrative permit",async()=>{
 assert.equal(MCP_BUSINESS_WRITES_ENABLED,false);assert.equal(QA_EXECUTION_RELEASE_ID,null);
 const db=testDatabase(),f=await fixture();try{
  const env={MCP_PROPOSALS_ENABLED:"true",MCP_APPROVAL_ORIGIN:origin,MCP_APPROVAL_CREDENTIALS:JSON.stringify([f.key.pin]),MCP_QA_EXECUTION_PERMIT:await f.sign()};
  const engine=runtimeProposalEngine(db.database,actor,env,context),plan=await engine.prepare([{actionId:"t",kind:"task.create",input:{title:"Synthetic closed gate"}}]);
  const c=await engine.requestApproval(plan.proposalId);await engine.approve(plan.proposalId,c.challenge,f.key.assertion(c.challenge));
  await assert.rejects(()=>engine.commit(plan.proposalId,1,plan.digest,"synthetic-closed"),deny);assert.equal(db.sqlite.prepare("SELECT count(*) n FROM home_tasks").get()?.n,0);
  await assert.rejects(()=>engine.commitFromMcp(plan.proposalId,1,plan.digest,"synthetic-network-closed"),deny);assert.equal(await engine.businessWritesEnabled(),false);
 }finally{db.close();}
});
test("permit expiry is checked in the atomic SQL guard despite a stale application clock",async()=>{
 const db=testDatabase(),f=await fixture();try{
  const stale=new Date(Date.now()-10_000),engine=new ProposalEngine(db.database,{actor,registry:actionRegistry,verifier:webAuthnVerifier({origin,credentials:[f.key.pin]}),executionEnabled:true,now:()=>stale,authorizeExecution:async()=>({expiresAt:Date.now()-1000,permitDigest:"a".repeat(64),releaseId})});
  const plan=await engine.prepare([{actionId:"t",kind:"task.create",input:{title:"Synthetic expired grant"}}]),c=await engine.requestApproval(plan.proposalId);await engine.approve(plan.proposalId,c.challenge,f.key.assertion(c.challenge));
  await assert.rejects(()=>engine.commit(plan.proposalId,1,plan.digest,"synthetic-expired-sql"),{code:"commit_conflict"});
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM home_tasks").get()?.n,0);assert.equal(db.sqlite.prepare("SELECT count(*) n FROM mcp_executions").get()?.n,0);assert.equal(db.sqlite.prepare("SELECT count(*) n FROM mcp_plan_audit WHERE event='qa_execution_authorized'").get()?.n,0);assert.equal((await engine.get(plan.proposalId)).state,"APPROVED");
 }finally{db.close();}
});
test("a permit never substitutes operation approval and its fingerprint commits atomically once",async()=>{
 const db=testDatabase(),f=await fixture();try{
  const current=db.sqlite.prepare("SELECT installation_id FROM mcp_installation").get()!;
  const grant={...f.grant,installationId:String(current.installation_id)},serializedPermit=await f.sign(grant);
  const engine=new ProposalEngine(db.database,{actor,registry:actionRegistry,verifier:webAuthnVerifier({origin,credentials:[f.key.pin]}),executionEnabled:true,authorizeExecution:async()=>authorizeQaExecution({...f.input,installation:{installation_id:String(current.installation_id),metadata_version:1},serializedPermit})});
  const plan=await engine.prepare([{actionId:"t",kind:"task.create",input:{title:"Synthetic separately approved"}}]);
  await assert.rejects(()=>engine.commit(plan.proposalId,1,plan.digest,"synthetic-needs-approval"),{code:"approval_required"});
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM mcp_plan_audit WHERE event='qa_execution_authorized'").get()?.n,0);
  const c=await engine.requestApproval(plan.proposalId);await engine.approve(plan.proposalId,c.challenge,f.key.assertion(c.challenge));
  const receipt=await engine.commit(plan.proposalId,1,plan.digest,"synthetic-approved-once");assert.deepEqual(await engine.commit(plan.proposalId,1,plan.digest,"synthetic-approved-once"),receipt);
  const rows=db.sqlite.prepare("SELECT metrics FROM mcp_plan_audit WHERE event='qa_execution_authorized'").all();assert.equal(rows.length,1);const record=JSON.parse(String(rows[0].metrics));assert.match(record.permitDigest,/^[a-f0-9]{64}$/);assert.equal(record.releaseId,releaseId);assert.ok(!String(rows[0].metrics).includes("clientDataJSON"));
 }finally{db.close();}
});
