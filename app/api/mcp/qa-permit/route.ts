import {env} from "cloudflare:workers";
import hosting from "@/.openai/hosting.json";
import {handleQaPermitRequest} from "@/lib/mcp/plans/qa-permit-http";
import {approvalConfiguration,type ProposalEnvironment} from "@/lib/mcp/plans/runtime";
import {approvalError} from "@/lib/mcp/plans/approval-http";
import {finishDeniedRequest} from "@/lib/mcp/plans/limits";
import {actionRegistry} from "@/lib/mcp/plans/catalog";
import {QA_EXECUTION_RELEASE_ID} from "@/lib/mcp/plans/qa-execution-policy";
import {MCP_BUSINESS_WRITES_ENABLED} from "@/lib/mcp/future-contracts";
export const runtime="edge";
async function handle(request:Request){try{
 const e=env as unknown as ProposalEnvironment&{DB?:D1Database;MCP_OWNER_USER_ID?:string;MCP_OWNER_EMAIL?:string};if(!e.DB)throw Error("Database unavailable");const config=approvalConfiguration(e);
 return handleQaPermitRequest(request,{database:e.DB,ownerPolicy:{ownerUserId:e.MCP_OWNER_USER_ID,ownerEmail:e.MCP_OWNER_EMAIL},origin:config.origin,credentials:config.credentials,registry:actionRegistry,context:{projectId:hosting.project_id,origin:new URL(request.url).origin,releaseId:QA_EXECUTION_RELEASE_ID},releaseEnabled:MCP_BUSINESS_WRITES_ENABLED});
}catch(error){await finishDeniedRequest(request);return approvalError(error);}}
export {handle as GET,handle as POST};
