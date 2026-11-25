import { z } from "zod";
import { digest } from "./canonical.ts";
import { parseBoundedJson } from "./limits.ts";
import { webAuthnVerifier, type PinnedCredential } from "./approval.ts";
import type { McpIdentity } from "../auth.ts";
import type { ActionRegistry } from "./types.ts";
import { PlanError } from "./types.ts";

// Shared builds are never armed. A separate reviewed QA-only build and a
// personally signed administrative permit are both required before activation.
export const QA_EXECUTION_RELEASE_ID: string | null = null;
export const MAX_QA_PERMIT_MS = 15 * 60_000;
const bounded = z.string().min(1).max(200);
const grantSchema = z.object({
  audience: z.literal("vida-en-orden/qa-execution/v1"), dataClass: z.literal("synthetic-qa"),
  projectId: bounded, installationId: bounded, ownerId: bounded,
  origin: z.string().max(2048), releaseId: z.string().regex(/^[a-f0-9]{40}$/),
  catalogDigest: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.number().int().nonnegative().safe(), expiresAt: z.number().int().nonnegative().safe(),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{32,160}$/),
}).strict();
export type QaExecutionGrant = z.infer<typeof grantSchema>;
export type QaBuildContext = { projectId: string; origin: string; releaseId: string | null };
export const qaExecutionAuthorizationSchema = z.object({
  expiresAt: z.number().int().positive().safe(),
  permitDigest: z.string().regex(/^[a-f0-9]{64}$/),
  releaseId: z.string().regex(/^[a-f0-9]{40}$/),
}).strict();
export type QaExecutionAuthorization = z.infer<typeof qaExecutionAuthorizationSchema>;
export async function executionCatalogDigest(registry: ActionRegistry) {
  return digest([...registry.values()].map(entry => ({kind:entry.kind,phase:entry.phase,risk:entry.risk,input:entry.inputSchema??null})).sort((a,b)=>a.kind<b.kind?-1:a.kind>b.kind?1:0));
}
/** Domain separation prevents using a proposal assertion as an activation permit. */
export async function qaExecutionChallenge(grant: QaExecutionGrant): Promise<string> {
  const hex = await digest({ domain: "vida-en-orden/qa-execution-permit/v1", grant });
  return btoa(String.fromCharCode(...Uint8Array.from(hex.match(/../g)!,byte=>parseInt(byte,16)))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}

/** No database mutation, approval endpoint, pin installation or environment update. */
export async function authorizeQaExecution(input: {
  serializedPermit?: string; context?: QaBuildContext; actor: McpIdentity;
  installation: {installation_id:string;metadata_version:number}|null;
  approvalOrigin: string; credentials: readonly PinnedCredential[];
  registry: ActionRegistry; now?: number;
}): Promise<QaExecutionAuthorization> {
  const denied=()=>new PlanError("writes_disabled","La ejecución QA no está autorizada para esta instalación.",403);
  try {
    const {context,actor,installation}=input, now=input.now??Date.now();
    if(!context?.releaseId||!input.serializedPermit||new TextEncoder().encode(input.serializedPermit).byteLength>24*1024||!installation||installation.metadata_version!==1)throw denied();
    const {grant,proof}=z.object({grant:grantSchema,proof:z.unknown()}).strict().parse(parseBoundedJson(input.serializedPermit));
    const origin=new URL(context.origin);
    if(origin.protocol!=="https:"||origin.origin!==context.origin||context.origin!==input.approvalOrigin)throw denied();
    if(grant.projectId!==context.projectId||grant.origin!==context.origin||grant.releaseId!==context.releaseId||grant.ownerId!==actor.userId||grant.installationId!==installation.installation_id)throw denied();
    if(grant.issuedAt>now||grant.expiresAt<=now||grant.expiresAt<=grant.issuedAt||grant.expiresAt-grant.issuedAt>MAX_QA_PERMIT_MS)throw denied();
    if(grant.catalogDigest!==await executionCatalogDigest(input.registry))throw denied();
    await webAuthnVerifier({origin:context.origin,credentials:input.credentials}).verify(proof,await qaExecutionChallenge(grant),actor);
    return {expiresAt:grant.expiresAt,releaseId:grant.releaseId,permitDigest:await digest({domain:"vida-en-orden/qa-authorization-record/v1",grant,proof})};
  } catch { throw denied(); }
}
