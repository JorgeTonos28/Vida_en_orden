import { parseBoundedJson } from "./limits.ts";
import { z } from "zod";
import { ProposalEngine } from "./engine.ts";
import { actionRegistry } from "./catalog.ts";
import { webAuthnVerifier, type PinnedCredential } from "./approval.ts";
import { MCP_BUSINESS_WRITES_ENABLED } from "../future-contracts.ts";
import type { McpIdentity } from "../auth.ts";
import { PlanError } from "./types.ts";
import { authorizeQaExecution, type QaBuildContext } from "./qa-execution-policy.ts";
import { runtimeMetadata } from "./metadata.ts";
export type ProposalEnvironment={MCP_PROPOSALS_ENABLED?:string;MCP_EXTENDED_READS_ENABLED?:string;MCP_APPROVAL_ORIGIN?:string;MCP_APPROVAL_CREDENTIALS?:string;MCP_QA_EXECUTION_PERMIT?:string;};
const pins=z.array(z.object({ownerId:z.string().min(1).max(200),id:z.string().regex(/^[A-Za-z0-9_-]+$/).max(2048),publicKey:z.string().regex(/^[A-Za-z0-9_-]+$/).max(8192)}).strict()).max(5).refine(values=>new Set(values.map(v=>v.ownerId+":"+v.id)).size===values.length);
export function approvalConfiguration(environment:ProposalEnvironment):{origin:string;credentials:PinnedCredential[]}{
 if(environment.MCP_PROPOSALS_ENABLED!=="true")throw new PlanError("proposals_disabled","Las propuestas están deshabilitadas.",503);
 const origin=environment.MCP_APPROVAL_ORIGIN||"";
 try{const url=new URL(origin);if(url.protocol!=="https:"||url.origin!==origin)throw Error("origin");}catch{throw new PlanError("approval_unavailable","Configura un origen HTTPS exacto de aprobación.",503);}
 let credentials:PinnedCredential[];try{credentials=pins.parse(parseBoundedJson(environment.MCP_APPROVAL_CREDENTIALS||"[]"));}catch{throw new PlanError("approval_unavailable","La configuración administrativa de credenciales no es válida.",503);}
 return {origin,credentials};
}
export function runtimeProposalEngine(database:D1Database,actor:McpIdentity,environment:ProposalEnvironment,context?:QaBuildContext){
 const config=approvalConfiguration(environment);
 return new ProposalEngine(database,{actor,registry:actionRegistry,verifier:webAuthnVerifier(config),executionEnabled:MCP_BUSINESS_WRITES_ENABLED,
  authorizeExecution:async()=>authorizeQaExecution({serializedPermit:environment.MCP_QA_EXECUTION_PERMIT,context,actor,installation:await runtimeMetadata(database),approvalOrigin:config.origin,credentials:config.credentials,registry:actionRegistry})});
}
