import assert from "node:assert/strict";
import test from "node:test";
import { testDatabase } from "./helpers/d1.ts";
import { syntheticQaAuthorizer } from "./helpers/qa-authorization.ts";
import { credential } from "./helpers/webauthn.ts";
import { ProposalEngine } from "../lib/mcp/plans/engine.ts";
import { actionRegistry } from "../lib/mcp/plans/catalog.ts";
import { webAuthnVerifier } from "../lib/mcp/plans/approval.ts";
import { BUSINESS_TABLES } from "../lib/mcp/plans/tables.ts";
import { PlanError } from "../lib/mcp/plans/types.ts";

const actor={userId:"synthetic-reference-owner",email:"owner@example.test",fullName:null};
const origin="https://approval.example.test";
function fixture(){const db=testDatabase(),key=credential(actor.userId);return {...db,key,engine:new ProposalEngine(db.database,{actor,registry:actionRegistry,verifier:webAuthnVerifier({origin,credentials:[key.pin]}),executionEnabled:true,authorizeExecution:syntheticQaAuthorizer(db.database,actor,actionRegistry)})};}
const rejected=(error:unknown)=>error instanceof PlanError&&error.code==="reference_not_found"&&error.status===404&&!error.message.includes("synthetic-missing");

test("typed missing reference preserves approved revision, digest, evidence and usable authorization",async()=>{
 const f=fixture();try{
  const plan=await f.engine.prepare([{actionId:"task",kind:"task.create",input:{title:"Synthetic original"}}]);
  const challenge=await f.engine.requestApproval(plan.proposalId);await f.engine.approve(plan.proposalId,challenge.challenge,f.key.assertion(challenge.challenge));
  const evidence=JSON.stringify(f.sqlite.prepare("SELECT * FROM mcp_approval_evidence").all()),approval=JSON.stringify(f.sqlite.prepare("SELECT * FROM mcp_approvals").all());
  await assert.rejects(()=>f.engine.revise(plan.proposalId,[{actionId:"task",kind:"task.update",input:{id:"synthetic-missing",title:"Synthetic replacement"}}],1),rejected);
  const current=await f.engine.get(plan.proposalId);assert.equal(current.revision,1);assert.equal(current.state,"APPROVED");assert.equal(current.digest,plan.digest);
  assert.equal(JSON.stringify(f.sqlite.prepare("SELECT * FROM mcp_approval_evidence").all()),evidence);assert.equal(JSON.stringify(f.sqlite.prepare("SELECT * FROM mcp_approvals").all()),approval);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM mcp_proposals").get()?.n,1);
  for(const table of BUSINESS_TABLES){assert.equal(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table.name}`).get()?.n,0);assert.equal(f.sqlite.prepare(`SELECT COUNT(*) n FROM mcp_stage_${table.name}`).get()?.n,0);}
  await f.engine.commit(plan.proposalId,1,plan.digest,"synthetic-original-still-authorized");assert.equal(f.sqlite.prepare("SELECT title FROM home_tasks").get()?.title,"Synthetic original");
 }finally{f.close();}
});

test("financial, shared and calendar missing references use the same safe typed diagnostic",async()=>{
 const f=fixture();try{
  for(const [kind,input] of [["finance.account.update",{id:"synthetic-missing",name:"Synthetic account"}],["event.cancel",{id:"synthetic-missing"}],["project.update",{id:"synthetic-missing",name:"Synthetic project"}],["task.create",{title:"Synthetic child",parentId:"synthetic-missing"}]] as const){
   await assert.rejects(()=>f.engine.prepare([{actionId:"operation",kind,input}]),rejected);
  }
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM mcp_proposals").get()?.n,0);
 }finally{f.close();}
});

test("unknown domain failure is not reclassified by its message",async()=>{
 const f=fixture();try{
  const original=actionRegistry.get("task.create")!,failure=new Error("Tarea no encontrada");
  const engine=new ProposalEngine(f.database,{actor,registry:new Map([["task.create",{...original,execute:async()=>{throw failure;}}]]),verifier:webAuthnVerifier({origin,credentials:[]}),executionEnabled:false});
  await assert.rejects(()=>engine.prepare([{actionId:"task",kind:"task.create",input:{title:"Synthetic error"}}]),error=>error===failure);
 }finally{f.close();}
});
