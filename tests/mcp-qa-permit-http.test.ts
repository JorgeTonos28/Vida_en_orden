import test from "node:test";
import assert from "node:assert/strict";
import {testDatabase} from "./helpers/d1.ts";
import {credential} from "./helpers/webauthn.ts";
import {handleQaPermitRequest} from "../lib/mcp/plans/qa-permit-http.ts";
import {actionRegistry} from "../lib/mcp/plans/catalog.ts";
import {initializeRuntimeMetadata} from "../lib/mcp/plans/metadata.ts";
import {qaExecutionChallenge,type QaExecutionGrant} from "../lib/mcp/plans/qa-execution-policy.ts";
type Reply={csrfToken:string;armed:boolean;error?:string;grant:QaExecutionGrant;publicKey:{challenge:string};installed:boolean;businessWritesEnabled:boolean;permit:{grant:QaExecutionGrant}};
const reply=async(r:Response)=>await r.json() as Reply;
const actor={userId:"synthetic-permit-owner",email:"owner@example.test"},origin="https://approval.example.test",identity={"oai-authenticated-user-id":actor.userId,"oai-authenticated-user-email":actor.email};
function request(body?:unknown,headers:Record<string,string>={}){return new Request(origin+"/api/mcp/qa-permit",{method:body?"POST":"GET",headers:{...identity,...(body?{"content-type":"application/json"}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});}
test("unarmed permit HTTP is owner-only, CSRF guarded and cannot bootstrap or emit a permit",async()=>{
 const db=testDatabase(),key=credential(actor.userId),deps={database:db.database,ownerPolicy:{ownerUserId:actor.userId},context:{projectId:"synthetic-project",origin,releaseId:null},origin,credentials:[key.pin],registry:actionRegistry,releaseEnabled:false};
 try{
  assert.equal((await handleQaPermitRequest(request(undefined,{"oai-authenticated-user-id":""}),deps)).status,401);
  assert.equal((await handleQaPermitRequest(request(undefined,{"oai-authenticated-user-id":"synthetic-other"}),deps)).status,403);
  const get=await handleQaPermitRequest(request(),deps),session=await reply(get);assert.equal(get.headers.get("x-frame-options"),"DENY");assert.equal(session.armed,false);
  const headers={origin,cookie:get.headers.get("set-cookie")!.split(";")[0],"x-veo-csrf":session.csrfToken};
  assert.equal((await handleQaPermitRequest(request({action:"options"},{...headers,"x-veo-csrf":"bad"}),deps)).status,403);
  const denied=await handleQaPermitRequest(request({action:"options"},headers),deps);assert.equal((await reply(denied)).error,"writes_disabled");
  assert.equal(db.sqlite.prepare("SELECT metadata_version FROM mcp_installation").get()?.metadata_version,0);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM home_tasks").get()?.n,0);
 }finally{db.close();}
});
test("synthetic owner signs an exact administrative grant; endpoint returns it without installation or business writes",async()=>{
 const db=testDatabase(),key=credential(actor.userId),deps={database:db.database,ownerPolicy:{ownerUserId:actor.userId},context:{projectId:"synthetic-project",origin,releaseId:"d".repeat(40)},origin,credentials:[key.pin],registry:actionRegistry,releaseEnabled:true};
 try{
  await initializeRuntimeMetadata(db.database,actor.userId,Date.now());
  const get=await handleQaPermitRequest(request(),deps),session=await reply(get),headers={origin,cookie:get.headers.get("set-cookie")!.split(";")[0],"x-veo-csrf":session.csrfToken};
  const options=await reply(await handleQaPermitRequest(request({action:"options"},headers),deps));assert.equal(options.grant.ownerId,actor.userId);assert.equal(options.publicKey.challenge,await qaExecutionChallenge(options.grant));
  const proof=key.assertion(options.publicKey.challenge),bad=await handleQaPermitRequest(request({action:"verify",grant:{...options.grant,projectId:"synthetic-other"},proof},headers),deps);assert.equal((await reply(bad)).error,"writes_disabled");
  const verified=await handleQaPermitRequest(request({action:"verify",grant:options.grant,proof},headers),deps),data=await reply(verified);assert.equal(verified.status,200);assert.equal(data.installed,false);assert.equal(data.businessWritesEnabled,false);assert.deepEqual(data.permit.grant,options.grant);
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM mcp_executions").get()?.n,0);assert.equal(db.sqlite.prepare("SELECT count(*) n FROM home_tasks").get()?.n,0);
  const noKey=await handleQaPermitRequest(request({action:"options"},headers),{...deps,credentials:[]});assert.equal((await reply(noKey)).error,"credential_required");
 }finally{db.close();}
});
