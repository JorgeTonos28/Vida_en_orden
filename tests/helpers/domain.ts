import { testDatabase } from "./d1.ts";
import { ProposalEngine } from "../../lib/mcp/plans/engine.ts";
import { actionRegistry } from "../../lib/mcp/plans/catalog.ts";
import type { PlanAction, ApprovalVerifier } from "../../lib/mcp/plans/types.ts";
import { syntheticQaAuthorizer } from "./qa-authorization.ts";
const actor = { userId: "synthetic-owner", email: "owner@example.test", fullName: "Synthetic owner" };
const verifier: ApprovalVerifier = { channel: "isolated-test", async verify(proof,challenge) { if (proof !== challenge) throw Error("not human fixture"); return { credentialId: "test-key" }; } };
export function domainFixture() {
  const db = testDatabase();
  const clock = new Date();
  const engine = new ProposalEngine(db.database, { actor, registry: actionRegistry, verifier, executionEnabled: true, authorizeExecution: syntheticQaAuthorizer(db.database, actor, actionRegistry), now: () => clock });
  const run = async (actions: PlanAction[]) => { const plan = await engine.prepare(actions); const challenge = await engine.requestApproval(plan.proposalId); await engine.approve(plan.proposalId,challenge.challenge,challenge.challenge); return { plan, receipt: await engine.commit(plan.proposalId,plan.revision,plan.digest,crypto.randomUUID()) }; };
  return { ...db, engine, run };
}
export const planAction = (actionId: string,kind: string,input: Record<string,unknown>): PlanAction => ({ actionId,kind,input });
export const localReference = (name: string) => ({ $ref: name });
