import {z} from "zod";
import {approvalSession,approvalJson,approvalError,approvalBody} from "./approval-http.ts";
import {finishDeniedRequest} from "./limits.ts";
import {randomChallenge} from "./canonical.ts";
import {runtimeMetadata} from "./metadata.ts";
import {authorizeQaExecution,executionCatalogDigest,qaExecutionChallenge,MAX_QA_PERMIT_MS,type QaBuildContext,type QaExecutionGrant} from "./qa-execution-policy.ts";
import {PlanError,type ActionRegistry} from "./types.ts";
import type {DomainDatabase} from "../../domain/context.ts";
import type {McpOwnerPolicy} from "../auth.ts";
import type {PinnedCredential} from "./approval.ts";
const schema=z.discriminatedUnion("action",[z.object({action:z.literal("options")}).strict(),z.object({action:z.literal("verify"),grant:z.unknown(),proof:z.unknown()}).strict()]);
export async function handleQaPermitRequest(request:Request,dependencies:{database:DomainDatabase;ownerPolicy:McpOwnerPolicy;context:QaBuildContext;origin:string;credentials:readonly PinnedCredential[];registry:ActionRegistry;releaseEnabled:boolean}){
 try{
  if(!["GET","POST"].includes(request.method))return approvalJson({error:"method_not_allowed"},405);
  const {actor,token}=approvalSession(request,dependencies.ownerPolicy,dependencies.origin),credentials=dependencies.credentials.filter(k=>k.ownerId===actor.userId),armed=dependencies.releaseEnabled&&!!dependencies.context.releaseId;
  if(request.method==="GET")return approvalJson({owner:actor.email,csrfToken:token,armed,credentialConfigured:credentials.length>0,businessWritesEnabled:false},200,token);
  if(!armed)throw new PlanError("writes_disabled","Esta versión no está armada para emitir permisos QA.",403);
  if(!credentials.length)throw new PlanError("credential_required","El propietario debe registrar personalmente su credencial y fijarla por administración.",503);
  const parsed=schema.safeParse(await approvalBody(request));if(!parsed.success)throw new PlanError("invalid_input","Solicitud de permiso inválida.",400);
  const installation=await runtimeMetadata(dependencies.database);if(!installation||installation.metadata_version!==1)throw new PlanError("initialization_required","Inicializa los metadatos mediante registro o preparación explícitos.",503);
  if(parsed.data.action==="options"){
   const now=Date.now(),grant:QaExecutionGrant={audience:"vida-en-orden/qa-execution/v1",dataClass:"synthetic-qa",projectId:dependencies.context.projectId,origin:dependencies.origin,releaseId:dependencies.context.releaseId!,installationId:installation.installation_id,ownerId:actor.userId,catalogDigest:await executionCatalogDigest(dependencies.registry),issuedAt:now,expiresAt:now+MAX_QA_PERMIT_MS,nonce:randomChallenge()};
   return approvalJson({grant,publicKey:{challenge:await qaExecutionChallenge(grant),rpId:new URL(dependencies.origin).hostname,allowCredentials:credentials.map(k=>({id:k.id,type:"public-key"})),userVerification:"required",timeout:60000}});
  }
  const permit={grant:parsed.data.grant,proof:parsed.data.proof};const authorization=await authorizeQaExecution({serializedPermit:JSON.stringify(permit),context:dependencies.context,actor,installation,approvalOrigin:dependencies.origin,credentials,registry:dependencies.registry});
  // Return an artifact to the human/admin. This endpoint cannot install the
  // permit, change flags, create trust anchors or execute a business proposal.
  return approvalJson({permit,authorization,businessWritesEnabled:false,installed:false});
 }catch(error){await finishDeniedRequest(request);return approvalError(error);}
}
