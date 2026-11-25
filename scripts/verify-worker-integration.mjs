import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { request as httpsRequest, Agent } from "node:https";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { getPlatformProxy, unstable_dev, unstable_splitSqlQuery } from "wrangler";
import { credential } from "../tests/helpers/webauthn.ts";
import { MCP_TOOL_DEFINITIONS } from "../lib/mcp/server.ts";
import { MCP_PROTOCOL_VERSION } from "../lib/mcp/protocol.ts";
import { sitesMigrationProjection } from "./sites-migration-projection.mjs";
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),build=join(root,"dist/server/wrangler.json");
const sitesMode=process.argv.slice(2).includes("--sites");
if(process.argv.slice(2).some(value=>value!=="--sites"))throw Error("Unsupported integration option");
if(!existsSync(build))throw Error("Run npm run build before verify:worker.");
process.env.WRANGLER_SEND_METRICS="false";process.env.CLOUDFLARE_CF_FETCH_ENABLED="false";
const temp=mkdtempSync(join(tmpdir(),"veo-worker-verification-")),persist=join(temp,"state"),config=join(temp,"wrangler.json");let proxy,worker,certificate;
const agent=new Agent({keepAlive:true});
const port=await new Promise((resolvePort,reject)=>{const server=createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const value=server.address().port;server.close(error=>error?reject(error):resolvePort(value));});});
const base=`https://localhost:${port}`,actor={userId:"local_preview_owner",email:"owner@example.test"},key=credential(actor.userId,base);
const identity={"oai-authenticated-user-id":actor.userId,"oai-authenticated-user-email":actor.email};
function request(path,body,extraHeaders={}){
 return new Promise((resolveResponse,reject)=>{
  const encoded=body===undefined?undefined:JSON.stringify(body);
  const req=httpsRequest(base+path,{method:encoded===undefined?"GET":"POST",family:4,agent,rejectUnauthorized:!!certificate,...(certificate?{ca:certificate}:{}),headers:{...identity,...(encoded?{"content-type":"application/json","content-length":Buffer.byteLength(encoded)}:{}),...extraHeaders}},response=>{
   const raw=response.socket.getPeerCertificate?.().raw;if(!certificate&&raw)certificate=`-----BEGIN CERTIFICATE-----\n${raw.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END CERTIFICATE-----\n`;
   const chunks=[];let size=0;response.on("data",chunk=>{size+=chunk.length;if(size>2*1024*1024){response.destroy(Error("Oversized local test response"));return;}chunks.push(chunk);});response.once("error",reject);response.on("end",()=>{const text=Buffer.concat(chunks).toString("utf8");let json;try{json=JSON.parse(text);}catch{/* HTML page response */}resolveResponse({status:response.statusCode,headers:response.headers,text,json});});
  });req.once("error",reject);req.setTimeout(30000,()=>req.destroy(Error("Local Worker timeout")));req.end(encoded);
 });
}
async function tool(name,args={}){
 const response=await request("/mcp",{jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args,_meta:{"io.modelcontextprotocol/protocolVersion":MCP_PROTOCOL_VERSION,"io.modelcontextprotocol/clientInfo":{name:"isolated-worker-check",version:"1"},"io.modelcontextprotocol/clientCapabilities":{}}}},{"MCP-Protocol-Version":MCP_PROTOCOL_VERSION,"Mcp-Method":"tools/call","Mcp-Name":name});assert.equal(response.status,200,name);assert.ok(!response.json.error,name+": "+JSON.stringify(response.json));return response.json.result.structuredContent;
}
const missingArgs={get_task:{task_id:"synthetic-missing"},list_task_relations:{task_id:"synthetic-missing"},get_area:{area_id:"synthetic-missing"},get_project:{project_id:"synthetic-missing"},get_calendar_event:{event_id:"synthetic-missing"},get_account:{account_id:"synthetic-missing"},get_transaction:{transaction_id:"synthetic-missing"},get_obligation:{obligation_id:"synthetic-missing"},get_goal:{goal_id:"synthetic-missing"},search_all:{query:"synthetic"}};
try{
 const built=JSON.parse(readFileSync(build,"utf8"));
 writeFileSync(config,JSON.stringify({name:"veo-isolated-worker-check",main:resolve(root,"dist/server",built.main),no_bundle:true,rules:built.rules,compatibility_date:built.compatibility_date,compatibility_flags:built.compatibility_flags,assets:{directory:resolve(root,"dist/server",built.assets.directory)},vars:{MCP_OWNER_USER_ID:actor.userId,MCP_OWNER_EMAIL:actor.email,MCP_PROPOSALS_ENABLED:"true",MCP_EXTENDED_READS_ENABLED:"true",MCP_APPROVAL_ORIGIN:base,MCP_APPROVAL_CREDENTIALS:JSON.stringify([key.pin])},d1_databases:[{binding:"DB",database_name:"synthetic-worker-db",database_id:"00000000-0000-4000-8000-000000000000"}],dev:{ip:"127.0.0.1",local_protocol:"https"}}));
 proxy=await getPlatformProxy({configPath:config,envFiles:[],persist:{path:join(persist,"v3")},remoteBindings:false});
 const files=sitesMode?sitesMigrationProjection(join(root,"drizzle")):readdirSync(join(root,"drizzle")).filter(file=>/^\d{4}.*\.sql$/.test(file)).sort().map(file=>({file,sql:readFileSync(join(root,"drizzle",file),"utf8")}));for(const file of files)await proxy.env.DB.batch(unstable_splitSqlQuery(file.sql).map(sql=>proxy.env.DB.prepare(sql)));
 await proxy.dispose();proxy=undefined;
 worker=await unstable_dev(resolve(root,"dist/server",built.main),{config,envFiles:[],moduleRoot:join(root,"dist/server"),local:true,ip:"127.0.0.1",port,inspectorPort:0,localProtocol:"https",bundle:false,persistTo:persist,logLevel:"error",experimental:{forceLocal:true,watch:false,disableDevRegistry:true,disableExperimentalWarning:true,enableContainers:false,showInteractiveDevSession:false}});
 const capabilities=await tool("get_capabilities");assert.equal(capabilities.businessWritesEnabled,false);assert.equal(capabilities.tools.length,44);
 let successful=0,notFound=0;for(const definition of MCP_TOOL_DEFINITIONS){assert.equal(definition.annotations.readOnlyHint,true);const result=await tool(definition.name,missingArgs[definition.name]||{});if(result.error){assert.equal(result.error,"not_found",definition.name);notFound++;}else successful++;}assert.equal(successful+notFound,31);
 const references=await tool("validate_references");assert.equal(references.valid,true);assert.ok(Object.values(references.checked).every(value=>value===0));
 const home=await tool("get_configuration",{section:"home"});assert.equal(home.home,null);
 const preSetupHealth=await tool("get_change_plan_health");assert.equal(preSetupHealth.metadataReady,false);
 console.log(`PASS · 31 read tools through the built Worker (${successful} valid, ${notFound} expected not_found); no business rows.`);
 // Regression: owner enrollment precedes the first proposal in the actual setup guide.
 const enrollment=await request("/api/mcp/enrollment"),enrollmentHeaders={origin:base,cookie:enrollment.headers["set-cookie"][0].split(";")[0],"x-veo-csrf":enrollment.json.csrfToken};
 assert.equal((await tool("get_change_plan_health")).metadataReady,false,"Enrollment GET must not initialize metadata");
 assert.equal((await request("/api/mcp/enrollment",{action:"options"},{...enrollmentHeaders,"x-veo-csrf":"bad"})).status,403);
 assert.equal((await tool("get_change_plan_health")).metadataReady,false,"Denied enrollment must not initialize metadata");
 const options=await request("/api/mcp/enrollment",{action:"options"},enrollmentHeaders);assert.equal(options.status,200,options.text);
 const candidate=await request("/api/mcp/enrollment",{action:"candidate",challenge:options.json.publicKey.challenge,proof:key.registration(options.json.publicKey.challenge)},enrollmentHeaders);assert.equal(candidate.status,200,candidate.text);assert.equal(candidate.json.trusted,false);
 assert.equal((await tool("get_change_plan_health")).metadataReady,true);
 const plan=await tool("prepare_change_plan",{actions:[{actionId:"t",kind:"task.create",input:{title:"Synthetic Worker approval"}}],idempotency_key:"worker-prepare"});assert.ok(plan.proposalId);
 assert.equal((await tool("get_change_plan_health")).metadataReady,true);
 assert.equal((await tool("get_financial_integrity_report",{month:new Date().toISOString().slice(0,7)})).status,"consistent");
 assert.equal((await tool("prepare_change_plan",{actions:[{actionId:"t",kind:"task.create",input:{title:"Synthetic Worker approval"}}],idempotency_key:"worker-prepare"})).proposalId,plan.proposalId);
 const path="/api/mcp/proposals/"+plan.proposalId,bootstrap=await request(path);assert.equal(bootstrap.status,200,bootstrap.text);assert.equal(bootstrap.json.credentialConfigured,true,"Synthetic test credential was not configured");const cookie=bootstrap.headers["set-cookie"][0].split(";")[0],csrf=bootstrap.json.csrfToken;
 const headers={origin:base,cookie,"x-veo-csrf":csrf};
 assert.equal((await request(path,{action:"challenge",digest:plan.digest,revision:1},{...headers,"x-veo-csrf":"bad"})).status,403);
 const challenge=await request(path,{action:"challenge",digest:plan.digest,revision:1},headers);assert.equal(challenge.status,200,challenge.text);
 const proof=key.assertion(challenge.json.publicKey.challenge);const approved=await request(path,{action:"approve",digest:plan.digest,revision:1,challenge:challenge.json.publicKey.challenge,proof},headers);assert.equal(approved.status,200,approved.text);assert.equal(approved.json.proposal.state,"APPROVED");
 assert.equal((await tool("commit_approved_change_plan",{proposal_id:plan.proposalId,revision:1,digest:plan.digest,idempotency_key:"worker-commit"})).error,"writes_disabled");
 assert.equal((await tool("search_tasks",{query:"Synthetic Worker approval",status:"all"})).items.length,0);
 const page=await request("/approvals/"+plan.proposalId);assert.equal(page.status,200);assert.equal(page.headers["x-frame-options"],"DENY");assert.ok(String(page.headers["content-security-policy"]).includes("frame-ancestors 'none'"));
 console.log("PASS · Worker WebAuthn cryptography, CSRF, candidate-only enrollment, anti-framing and closed MCP execution gate.");
 // Fresh QA acceptance through the transport: revision/cancellation must survive
 // independent requests without turning staging into persisted business rows.
 const invalidRevision=await tool("revise_change_plan",{proposal_id:plan.proposalId,expected_revision:1,actions:[{actionId:"t",kind:"task.create",input:{title:""}}]});
 assert.equal(invalidRevision.error,"invalid_input");
 assert.equal((await tool("get_approval_status",{proposal_id:plan.proposalId})).state,"APPROVED");
 const missingReference=await tool("revise_change_plan",{proposal_id:plan.proposalId,expected_revision:1,actions:[{actionId:"t",kind:"task.update",input:{id:"synthetic-missing",title:"Synthetic missing reference"}}]});
 // Typed domain failure must retain the approved head and its authorization.
 assert.equal(missingReference.error,"reference_not_found");
 const preserved=await tool("get_pending_proposal",{proposal_id:plan.proposalId});assert.equal(preserved.revision,1);assert.equal(preserved.digest,plan.digest);assert.equal(preserved.state,"APPROVED");
 const revised=await tool("revise_change_plan",{proposal_id:plan.proposalId,expected_revision:1,actions:[{actionId:"t",kind:"task.create",input:{title:"Synthetic Worker revised preview"}}]});
 assert.equal(revised.revision,2);assert.notEqual(revised.digest,plan.digest);
 assert.equal((await tool("get_pending_proposal",{proposal_id:plan.proposalId,revision:1})).state,"INVALIDATED");
 assert.equal((await tool("cancel_change_plan",{proposal_id:plan.proposalId,expected_revision:1})).error,"stale_proposal");
 const reloaded=await request(path);assert.equal(reloaded.status,200);assert.equal(reloaded.json.proposal.revision,2);assert.equal(reloaded.json.proposal.digest,revised.digest);
 const originalRetry=await tool("prepare_change_plan",{actions:[{actionId:"t",kind:"task.create",input:{title:"Synthetic Worker approval"}}],idempotency_key:"worker-prepare"});
 assert.equal(originalRetry.proposalId,plan.proposalId);assert.equal(originalRetry.revision,1);assert.equal(originalRetry.digest,plan.digest);
 assert.equal((await tool("cancel_change_plan",{proposal_id:plan.proposalId,expected_revision:2})).state,"CANCELLED");
 assert.equal((await tool("get_approval_status",{proposal_id:plan.proposalId})).state,"CANCELLED");
 assert.equal((await tool("commit_approved_change_plan",{proposal_id:plan.proposalId,revision:2,digest:revised.digest,idempotency_key:"cancelled-worker-commit"})).error,"writes_disabled");
 const afterPreview=await tool("validate_references");assert.equal(afterPreview.valid,true);assert.ok(Object.values(afterPreview.checked).every(value=>value===0));
 assert.equal((await tool("get_configuration",{section:"home"})).home,null);
 assert.equal((await tool("get_change_plan_health")).staging.total,0);
 console.log("PASS · Worker revision, stale cancellation, request reload, original idempotency, cancellation and zero business effects.");
 const permitBootstrap=await request("/api/mcp/qa-permit");assert.equal(permitBootstrap.status,200);assert.equal(permitBootstrap.json.armed,false);assert.equal(permitBootstrap.json.businessWritesEnabled,false);
 const permitHeaders={origin:base,cookie:permitBootstrap.headers["set-cookie"][0].split(";")[0],"x-veo-csrf":permitBootstrap.json.csrfToken};
 assert.equal((await request("/api/mcp/qa-permit",{action:"options"},{...permitHeaders,"x-veo-csrf":"bad"})).status,403);
 assert.equal((await request("/api/mcp/qa-permit",{action:"options"},permitHeaders)).json.error,"writes_disabled");
 const permitPage=await request("/approvals/qa-permit");assert.equal(permitPage.status,200);assert.equal(permitPage.headers["x-frame-options"],"DENY");
 console.log("PASS · Administrative QA permit route is unarmed, owner/CSRF guarded and cannot activate execution.");
 const ca=join(temp,"localhost-ca.pem");writeFileSync(ca,certificate);
 await new Promise((resolveChild,reject)=>{const child=spawn(process.execPath,["--dns-result-order=ipv4first",join(root,"scripts/qa-v2.mjs")],{cwd:root,env:{...process.env,QA_BASE_URL:base,NODE_EXTRA_CA_CERTS:ca},stdio:["ignore","pipe","pipe"]});child.stdout.on("data",chunk=>process.stdout.write(chunk));child.stderr.on("data",chunk=>process.stderr.write(chunk));child.once("error",reject);child.once("exit",code=>code===0?resolveChild():reject(Error("Local UI QA failed")));});
 console.log(`Worker integration verified (${sitesMode?"Sites schema projection":"full migration chain"}) with synthetic data and a self-signed loopback certificate; no remote database or Site contacted. Human/platform approval remains unverified.`);
}finally{agent.destroy();await worker?.stop();await proxy?.dispose();const target=resolve(temp);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes("veo-worker-verification-"));rmSync(target,{recursive:true,force:true,maxRetries:8,retryDelay:150});}
