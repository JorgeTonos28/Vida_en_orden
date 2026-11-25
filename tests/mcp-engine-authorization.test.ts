import assert from "node:assert/strict";
import test from "node:test";
import { ProposalEngine } from "../lib/mcp/plans/engine.ts";
import { actionRegistry } from "../lib/mcp/plans/catalog.ts";
import { webAuthnVerifier } from "../lib/mcp/plans/approval.ts";
import type { QaExecutionAuthorization } from "../lib/mcp/plans/qa-execution-policy.ts";
import { callProposalTool } from "../lib/mcp/plans/tools.ts";
import { createMcpReadService } from "../lib/mcp/read-service.ts";
import { testDatabase } from "./helpers/d1.ts";
import { credential } from "./helpers/webauthn.ts";
import { syntheticQaAuthorizer } from "./helpers/qa-authorization.ts";

const actor = { userId: "synthetic-engine-owner", email: "owner@example.test", fullName: null };
const origin = "https://approval.example.test", denied = { code: "writes_disabled", status: 403 };
type Authorizer = () => Promise<QaExecutionAuthorization>;
function fixture() {
  const db = testDatabase(), key = credential(actor.userId);
  const valid = syntheticQaAuthorizer(db.database, actor, actionRegistry);
  const create = (authorizeExecution: Authorizer | undefined, executionEnabled = true) => new ProposalEngine(db.database, {
    actor, registry: actionRegistry, executionEnabled, authorizeExecution,
    verifier: webAuthnVerifier({ origin, credentials: [key.pin] }),
  });
  // Includes approvals, challenges, guards, metadata and both audit logs.
  const snapshot = () => JSON.stringify(db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(t => [t.name, db.sqlite.prepare(`SELECT * FROM ${t.name}`).all().map(r => JSON.stringify(r)).sort()]));
  const approve = async (engine: ProposalEngine, id: string) => {
    const challenge = await engine.requestApproval(id);
    return engine.approve(id, challenge.challenge, key.assertion(challenge.challenge));
  };
  return { ...db, create, valid, snapshot, approve };
}

const invalidResults: Array<[string, () => unknown]> = [
  ["undefined", () => undefined], ["null", () => null], ["boolean", () => true], ["empty", () => ({})],
  ["missing deadline", () => ({ releaseId: "a".repeat(40), permitDigest: "b".repeat(64) })],
  ["missing release", () => ({ expiresAt: Date.now() + 60_000, permitDigest: "b".repeat(64) })],
  ["missing fingerprint", () => ({ expiresAt: Date.now() + 60_000, releaseId: "a".repeat(40) })],
  ["invalid release", () => ({ expiresAt: Date.now() + 60_000, releaseId: "invalid", permitDigest: "b".repeat(64) })],
  ["invalid fingerprint", () => ({ expiresAt: Date.now() + 60_000, releaseId: "a".repeat(40), permitDigest: "invalid" })],
  ["expired", () => ({ expiresAt: Date.now() - 1, releaseId: "a".repeat(40), permitDigest: "b".repeat(64) })],
  ["non-finite deadline", () => ({ expiresAt: Infinity, releaseId: "a".repeat(40), permitDigest: "b".repeat(64) })],
  ["fractional deadline", () => ({ expiresAt: Date.now() + 0.5, releaseId: "a".repeat(40), permitDigest: "b".repeat(64) })],
  ["excessive deadline", () => ({ expiresAt: Date.now() + 24 * 60 * 60_000, releaseId: "a".repeat(40), permitDigest: "b".repeat(64) })],
  ["unexpected fields", () => ({ expiresAt: Date.now() + 60_000, releaseId: "a".repeat(40), permitDigest: "b".repeat(64), confirmed: true })],
];

for (const [name, value] of [["absent", null], ["throws", () => { throw Error("Synthetic private diagnostic"); }], ...invalidResults] as const) {
  test(`direct engine and shared MCP deny ${name} authorization without any persisted effect`, async () => {
    const f = fixture();
    try {
      // Intentionally violate the TypeScript contract to exercise the runtime boundary.
      const authorize = value ? async () => value() as QaExecutionAuthorization : undefined;
      const engine = f.create(authorize), plan = await engine.prepare([{ actionId: "task", kind: "task.create", input: { title: "Synthetic denied task" } }]);
      await f.approve(engine, plan.proposalId);
      const before = f.snapshot(), args = { proposal_id: plan.proposalId, revision: plan.revision, digest: plan.digest, idempotency_key: "synthetic-denied" };
      await assert.rejects(() => engine.commit(plan.proposalId, plan.revision, plan.digest, args.idempotency_key), denied);
      await assert.rejects(() => engine.commitFromMcp(plan.proposalId, plan.revision, plan.digest, args.idempotency_key), denied);
      await assert.rejects(() => callProposalTool("commit_approved_change_plan", args, engine, origin), denied);
      assert.equal(f.snapshot(), before);
      assert.equal(await engine.executionResult(plan.proposalId, plan.revision), null);
      assert.equal((await engine.get(plan.proposalId)).state, "APPROVED");
    } finally { f.close(); }
  });
}

test("signed QA permit requires a separate proposal approval and receipts remain read-only after closure", async () => {
  const f = fixture();
  try {
    const engine = f.create(f.valid), plan = await engine.prepare([{ actionId: "task", kind: "task.create", input: { title: "Synthetic legitimate task" } }]);
    const before = f.snapshot();
    await assert.rejects(() => engine.commit(plan.proposalId, 1, plan.digest, "synthetic-valid"), { code: "approval_required" });
    assert.equal(f.snapshot(), before);
    await f.approve(engine, plan.proposalId);
    const receipt = await engine.commit(plan.proposalId, 1, plan.digest, "synthetic-valid");
    assert.equal(f.sqlite.prepare("SELECT title FROM home_tasks").get()?.title, "Synthetic legitimate task");
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM mcp_plan_audit WHERE event='qa_execution_authorized'").get()?.n, 1);
    const date = plan.payload.contextDate;
    const finance = await engine.prepare([
      { actionId: "account", kind: "finance.account.create", input: { name: "Synthetic smoke cash", type: "cash", openingBalanceMinor: 10000, openingBalanceDate: date } },
      { actionId: "expense", kind: "finance.transaction.create", input: { type: "expense", accountId: { $ref: "account" }, amountMinor: 1250, occurredOn: date, description: "Synthetic smoke expense" } },
    ]);
    await assert.rejects(() => engine.commit(finance.proposalId, 1, finance.digest, "synthetic-finance"), { code: "approval_required" });
    await f.approve(engine, finance.proposalId);
    const financialReceipt = await engine.commit(finance.proposalId, 1, finance.digest, "synthetic-finance");
    assert.deepEqual(await engine.commit(finance.proposalId, 1, finance.digest, "synthetic-finance"), financialReceipt);
    const account = await createMcpReadService(f.database, actor).getAccount({ account_id: financialReceipt.results[0].entityId, as_of: date }) as { account: { balanceMinor: number } };
    assert.equal(account.account.balanceMinor, 8750);
    assert.equal((await engine.verifyExecution(finance.proposalId, 1)).stillMatches, true);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM mcp_plan_audit WHERE event='qa_execution_authorized'").get()?.n, 2);
    const committed = f.snapshot();
    for (const enabled of [false, true]) {
      for (const authorization of [undefined, async () => { throw Error("Synthetic withdrawn permit"); }, async () => ({ expiresAt: 0, permitDigest: "", releaseId: "" })]) {
        const closed = f.create(authorization, enabled);
        assert.deepEqual(await closed.commit(plan.proposalId, 1, plan.digest, "synthetic-valid"), receipt);
        assert.deepEqual(await closed.executionResult(plan.proposalId, 1), receipt);
        assert.equal(f.snapshot(), committed);
      }
    }
    await assert.rejects(() => f.create(undefined).commit(plan.proposalId, 1, "0".repeat(64), "synthetic-valid"), { code: "digest_mismatch" });
  } finally { f.close(); }
});
