import assert from "node:assert/strict";
import { ProposalEngine } from "../../lib/mcp/plans/engine.ts";
import { actionRegistry } from "../../lib/mcp/plans/catalog.ts";
import { BUSINESS_TABLES } from "../../lib/mcp/plans/tables.ts";
import { canonicalize } from "../../lib/mcp/plans/canonical.ts";
import { webAuthnVerifier } from "../../lib/mcp/plans/approval.ts";
import { initializeRuntimeMetadata, runtimeMetadata } from "../../lib/mcp/plans/metadata.ts";
import { authorizeQaExecution, executionCatalogDigest, qaExecutionChallenge, type QaExecutionGrant } from "../../lib/mcp/plans/qa-execution-policy.ts";
import { createMcpReadService } from "../../lib/mcp/read-service.ts";
import { dateInTimeZone } from "../../lib/finance-math.ts";
import { credential } from "./webauthn.ts";
import type { Row, Snapshot } from "../../lib/mcp/plans/types.ts";

/** Every key, signature, grant, identity and record in this scenario is synthetic. */
export async function businessRoundTrip(database:D1Database){
 const actor={userId:"synthetic-complete-owner",email:"owner@example.test",fullName:null},origin="https://approval.example.test",key=credential(actor.userId),now=new Date(),date=dateInTimeZone(now,"America/Santo_Domingo"),month=date.slice(0,7);
 await initializeRuntimeMetadata(database,actor.userId,now.getTime());
 const installation=(await runtimeMetadata(database))!,context={projectId:"synthetic-qa-complete",origin,releaseId:"c".repeat(40)};
 const grant:QaExecutionGrant={audience:"vida-en-orden/qa-execution/v1",dataClass:"synthetic-qa",projectId:context.projectId,origin,releaseId:context.releaseId,ownerId:actor.userId,installationId:installation.installation_id,catalogDigest:await executionCatalogDigest(actionRegistry),issuedAt:Date.now()-1000,expiresAt:Date.now()+14*60_000,nonce:"synthetic-complete-"+"x".repeat(32)};
 const serializedPermit=JSON.stringify({grant,proof:key.assertion(await qaExecutionChallenge(grant))});
 const engine=new ProposalEngine(database,{actor,registry:actionRegistry,verifier:webAuthnVerifier({origin,credentials:[key.pin]}),executionEnabled:true,now:()=>now,authorizeExecution:async()=>authorizeQaExecution({serializedPermit,context,actor,installation:await runtimeMetadata(database),approvalOrigin:origin,credentials:[key.pin],registry:actionRegistry})});
 const reads=createMcpReadService(database,actor,()=>now),covered=new Set<string>();let steps=0;
 const snapshot=async():Promise<Snapshot>=>{
  const results=await database.batch(BUSINESS_TABLES.map(t=>database.prepare(`SELECT ${t.columns.join(",")} FROM ${t.name} ORDER BY ${t.primaryKey}`)));
  return Object.fromEntries(BUSINESS_TABLES.map((t,i)=>[t.name,results[i].results])) as Snapshot;
 };
 const normalized=(value:Snapshot)=>canonicalize(Object.fromEntries(BUSINESS_TABLES.map(t=>[t.name,value[t.name].map(canonicalize).sort()])));
 async function step(kind:string,input:Record<string,unknown>){
  const before=await snapshot(),plan=await engine.prepare([{actionId:"operation",kind,input}],`synthetic-step-${++steps}`);
  assert.equal(normalized(await snapshot()),normalized(before),kind+": prepare changed business");
  const challenge=await engine.requestApproval(plan.proposalId);await engine.approve(plan.proposalId,challenge.challenge,key.assertion(challenge.challenge));
  const approved=await engine.get(plan.proposalId);assert.equal(approved.digest,plan.digest);assert.equal(approved.state,"APPROVED");
  const receipt=await engine.commit(plan.proposalId,1,plan.digest,`synthetic-execution-${steps}`);
  assert.deepEqual(await engine.commit(plan.proposalId,1,plan.digest,`synthetic-execution-${steps}`),receipt);
  const expected=structuredClone(before);
  for(const change of plan.payload.changes){const table=BUSINESS_TABLES.find(t=>t.name===change.table)!,rows=expected[table.name];const index=rows.findIndex(r=>String(r[table.primaryKey])===change.id);if(index!==-1)rows.splice(index,1);if(change.after)rows.push(change.after as Row);}
  const actual=await snapshot(),expectedAuditIds=new Set(expected.audit_log.map(row=>row.id));
  const commitAudit=actual.audit_log.filter(row=>!expectedAuditIds.has(row.id));assert.equal(commitAudit.length,1,kind+": exactly one mandatory server audit");
  const audit=commitAudit[0];assert.match(String(audit.id),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);assert.equal(audit.owner_id,actor.userId);assert.equal(audit.entity_type,"mcp_plan");assert.equal(audit.entity_id,plan.proposalId);assert.equal(audit.action,"committed");assert.equal(audit.occurred_at,now.toISOString());assert.deepEqual(JSON.parse(String(audit.metadata)),{revision:1,kinds:[kind]});
  expected.audit_log.push(audit);
  assert.equal(normalized(actual),normalized(expected),kind+": persisted effects differ from approved delta plus mandatory audit");
  const verification=await engine.verifyExecution(plan.proposalId,1);assert.equal(verification.digestVerified,true);assert.equal(verification.stillMatches,true);assert.equal(verification.approvalEvidence?.signatureVerifiedAgainstRecordedKey,true);
  assert.equal((await reads.validateReferences({limit:50}) as {valid:boolean}).valid,true,kind+": references");
  assert.equal((await database.prepare("SELECT count(*) n FROM mcp_plan_audit WHERE proposal_id=? AND event='qa_execution_authorized'").bind(plan.proposalId).first<{n:number}>())?.n,1);
  covered.add(kind);return receipt.results[0].entityId!;
 }
 const area=await step("area.create",{name:"Synthetic area"});await step("area.update",{id:area,name:"Synthetic revised area"});
 const project=await step("project.create",{name:"Synthetic project",areaId:area});await step("project.update",{id:project,name:"Synthetic revised project",status:"paused"});
 const parent=await step("task.create",{title:"Synthetic parent"}),child=await step("task.create",{title:"Synthetic child",parentId:parent}),dependency=await step("task.create",{title:"Synthetic dependency"});
 await step("task.update",{id:child,title:"Synthetic revised child",dependencies:[dependency]});await step("task.context",{id:child,areaId:area,projectId:project,scheduledStartTime:"08:00",scheduledEndTime:"09:00"});
 await step("task.complete",{id:child,done:true});await step("task.complete",{id:child,done:false});
 const duplicate=await step("task.duplicate",{id:child});await step("task.archive",{id:duplicate,archived:true});await step("task.archive",{id:duplicate,archived:false});await step("task.delete",{id:duplicate});
 await step("task.reorder",{ids:[dependency,parent,child]});await step("workspace.update",{budgetLimit:10000,sort:"priority"});
 const note=await step("journal.create",{taskId:child,text:"Synthetic note"});await step("journal.update",{id:note,text:"Synthetic revised note"});await step("journal.delete",{id:note});
 const event=await step("event.create",{title:"Synthetic event",startDate:date,allDay:true,linkedTaskId:child,projectId:project});await step("event.update",{id:event,title:"Synthetic revised event"});await step("event.cancel",{id:event});
 const a=await step("finance.account.create",{name:"Synthetic A",type:"bank",bankName:"Synthetic bank A",openingBalanceMinor:100000,openingBalanceDate:date}),b=await step("finance.account.create",{name:"Synthetic B",type:"bank",bankName:"Synthetic bank B",openingBalanceMinor:0,openingBalanceDate:date}),empty=await step("finance.account.create",{name:"Synthetic empty",type:"cash",openingBalanceMinor:0,openingBalanceDate:date});
 await step("finance.account.update",{id:b,name:"Synthetic revised B"});await step("finance.account.archive",{id:empty});
 const expense=await step("finance.category.create",{name:"Synthetic expense",kind:"expense"}),income=await step("finance.category.create",{name:"Synthetic income",kind:"income"}),unused=await step("finance.category.create",{name:"Synthetic unused",kind:"expense"});
 await step("finance.category.update",{id:expense,name:"Synthetic revised expense"});await step("finance.category.delete",{id:unused});
 await step("finance.settings.update",{timezone:"America/Santo_Domingo",safetyBufferMinor:0,transferSameBankRateBps:0,transferAchRateBps:5,transferLbtrSurchargeMinor:100,transferBankFees:{}});
 await step("finance.transaction.create",{type:"income",accountId:a,categoryId:income,amountMinor:10000,occurredOn:date,description:"Synthetic income"});
 const netBefore=await reads.getFinanceReport({group_by:"type",date_from:date,date_to:date}) as {summary:{netCashImpactMinor:number}};
 await step("finance.transaction.create",{type:"transfer",accountId:a,destinationAccountId:b,amountMinor:12345,occurredOn:date,description:"Synthetic transfer",transferMode:"ach"});
 const netAfter=await reads.getFinanceReport({group_by:"type",date_from:date,date_to:date}) as {summary:{netCashImpactMinor:number}};assert.equal(netAfter.summary.netCashImpactMinor,netBefore.summary.netCashImpactMinor-6,"own transfer only contributes fee");
 await step("finance.transaction.create",{type:"adjustment",accountId:a,amountMinor:501,occurredOn:date,description:"Synthetic adjustment"});
 await step("finance.budget.set",{month,categoryId:expense,assignedMinor:20000});const addition=await step("finance.budget.addition.create",{month,categoryId:expense,assignedMinor:1000,concept:"Synthetic addition"});await step("finance.budget.update",{id:addition,month,categoryId:expense,assignedMinor:500,allocationType:"additional"});await step("finance.budget.delete",{id:addition});
 const obligation=await step("finance.obligation.create",{title:"Synthetic obligation",kind:"expense",expectedAmountMinor:2000,reservedMinor:1000,accountId:a,categoryId:expense,frequency:"monthly",nextDueDate:date});await step("finance.obligation.update",{id:obligation,title:"Synthetic revised obligation"});
 const occurrence=await database.prepare("SELECT id FROM finance_obligation_occurrences WHERE obligation_id=? ORDER BY due_date LIMIT 1").bind(obligation).first<{id:string}>();assert.ok(occurrence);await step("finance.obligation.pay",{occurrenceId:occurrence.id,accountId:a,amountMinor:1000,occurredOn:date});await step("finance.obligation.pay",{occurrenceId:occurrence.id,accountId:a,amountMinor:1000,occurredOn:date});
 const goal=await step("finance.goal.create",{title:"Synthetic goal",targetMinor:50000,accountId:a,categoryId:expense,linkedTaskId:child,linkedProjectId:project});await step("finance.goal.update",{id:goal,title:"Synthetic revised goal"});
 const entry=await step("finance.goal.contribute",{goalId:goal,amountMinor:10000,occurredOn:date});await step("finance.goal.entry.update",{id:entry,amountMinor:8000});
 const spend=await step("finance.transaction.create",{type:"expense",accountId:a,categoryId:expense,amountMinor:2000,occurredOn:date,description:"Synthetic goal expense",goalId:goal,taskId:child,projectId:project});await step("finance.transaction.update_amount",{id:spend,amountMinor:1500});await step("finance.transaction.void",{id:spend,reason:"Synthetic reversal"});
 assert.equal((await database.prepare("SELECT reserved_minor FROM finance_goals WHERE id=?").bind(goal).first<{reserved_minor:number}>())?.reserved_minor,8000);await step("finance.goal.entry.revert",{id:entry});
 const movement=await step("task.movement.create",{taskId:child,amountMinor:500,description:"Synthetic legacy movement",date});await step("task.movement.delete",{id:movement});
 assert.deepEqual([...covered].sort(),[...actionRegistry.keys()].sort());assert.equal(covered.size,43);
 assert.equal((await database.prepare("SELECT count(*) n FROM mcp_executions").first<{n:number}>())?.n,steps);
 return {operations:covered.size,executions:steps,syntheticWebAuthn:true,exactDeltaPreserved:true};
}
