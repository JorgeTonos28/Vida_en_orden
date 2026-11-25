import type { McpIdentity } from "../../lib/mcp/auth.ts";
import type { ActionRegistry } from "../../lib/mcp/plans/types.ts";
import { PlanError } from "../../lib/mcp/plans/types.ts";
import { runtimeMetadata } from "../../lib/mcp/plans/metadata.ts";
import { authorizeQaExecution, executionCatalogDigest, qaExecutionChallenge, type QaExecutionGrant } from "../../lib/mcp/plans/qa-execution-policy.ts";
import { credential } from "./webauthn.ts";

/** Independent synthetic admin key, signed permit and real policy; no test bypass. */
export function syntheticQaAuthorizer(database: D1Database, actor: McpIdentity, registry: ActionRegistry) {
  const key = credential(actor.userId), origin = "https://approval.example.test";
  const context = { projectId: "synthetic-engine-test", origin, releaseId: "f".repeat(40) };
  let permit: Promise<string> | undefined;
  async function issue(installationId: string) {
    const now = Date.now();
    const grant: QaExecutionGrant = {
      audience: "vida-en-orden/qa-execution/v1", dataClass: "synthetic-qa", ...context,
      ownerId: actor.userId, installationId, catalogDigest: await executionCatalogDigest(registry),
      issuedAt: now - 1000, expiresAt: now + 14 * 60_000, nonce: crypto.randomUUID().replaceAll("-", ""),
    };
    return JSON.stringify({ grant, proof: key.assertion(await qaExecutionChallenge(grant)) });
  }
  return async () => {
    const installation = await runtimeMetadata(database);
    if (!installation) throw new PlanError("writes_disabled", "Missing synthetic installation", 403);
    const serializedPermit = await (permit ??= issue(installation.installation_id));
    return authorizeQaExecution({ serializedPermit, context, actor, installation, registry, approvalOrigin: origin, credentials: [key.pin] });
  };
}
