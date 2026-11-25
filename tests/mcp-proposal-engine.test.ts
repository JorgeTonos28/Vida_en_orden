import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { testDatabase } from "./helpers/d1.ts";
import { syntheticQaAuthorizer } from "./helpers/qa-authorization.ts";
import { action } from "../lib/domain/home-service.ts";
import { runWithDomainDatabase } from "../lib/domain/context.ts";
import { ProposalEngine } from "../lib/mcp/plans/engine.ts";
import { canonicalize, digest } from "../lib/mcp/plans/canonical.ts";
import { BUSINESS_TABLES } from "../lib/mcp/plans/tables.ts";
import type { ActionRegistry, ApprovalVerifier } from "../lib/mcp/plans/types.ts";

const owner = { userId: "test-owner", email: "owner@example.test", fullName: null };
const input = [{ actionId: "task", kind: "test.task.create", input: { title: "Synthetic task" } }];
const registry: ActionRegistry = new Map([["test.task.create", {
  kind: "test.task.create", phase: 4, risk: "R1", targetTable: "home_tasks",
  schema: z.object({ title: z.string().min(1).max(200) }).strict(),
  execute: (actor, payload) => action(actor.userId, "Synthetic owner", { action: "createTask", ...payload }),
}]]);
const verifier: ApprovalVerifier = { channel: "isolated-test", async verify(proof, challenge) {
  if (!proof || typeof proof !== "object" || !("isolatedHumanAction" in proof) || proof.isolatedHumanAction !== challenge) throw new Error("No simulated approval");
  return { credentialId: "synthetic-authenticator" };
} };
function fixture(enabled = true) {
  const db = testDatabase();
  let clock = new Date();
  const engine = new ProposalEngine(db.database, { actor: owner, registry, verifier, executionEnabled: enabled, authorizeExecution: syntheticQaAuthorizer(db.database, owner, registry), now: () => clock });
  const snapshot = () => JSON.stringify(BUSINESS_TABLES.map((table) => db.sqlite.prepare(`SELECT * FROM ${table.name} ORDER BY ${table.primaryKey}`).all()));
  const approve = async (proposalId: string) => {
    const request = await engine.requestApproval(proposalId);
    return engine.approve(proposalId, request.challenge, { isolatedHumanAction: request.challenge });
  };
  return { ...db, engine, snapshot, approve, advance: (milliseconds: number) => { clock = new Date(clock.getTime() + milliseconds); } };
}

test("preparar ejecuta el servicio existente únicamente en staging y muestra el diff exacto", async () => {
  const f = fixture();
  try {
    const before = f.snapshot(); const plan = await f.engine.prepare(input);
    assert.equal(f.snapshot(), before);
    assert.ok(plan.payload.changes.some((change) => change.table === "home_tasks" && change.after?.title === "Synthetic task"));
    assert.equal(plan.payload.changes.filter((change) => change.table === "home_tasks").length, 1);
    for (const table of BUSINESS_TABLES) assert.equal(f.sqlite.prepare(`SELECT COUNT(*) n FROM mcp_stage_${table.name}`).get()?.n, 0);
    assert.equal(await digest({ domain: "vida-en-orden/proposal/v1", payload: plan.payload }), plan.digest);
  } finally { f.close(); }
});

test("no acepta confirmación del modelo, operación desconocida ni argumentos de propietario", async () => {
  const f = fixture();
  try {
    await assert.rejects(() => f.engine.prepare([{ ...input[0], kind: "execute_sql" }]));
    await assert.rejects(() => f.engine.prepare([{ ...input[0], input: { title: "x", user_id: "other" } }]));
    const plan = await f.engine.prepare(input); const request = await f.engine.requestApproval(plan.proposalId);
    await assert.rejects(() => f.engine.approve(plan.proposalId, request.challenge, { confirmed: true }));
    await assert.rejects(() => f.engine.commit(plan.proposalId, plan.revision, plan.digest, "one"));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM home_tasks").get()?.n, 0);
  } finally { f.close(); }
});

test("la compuerta de producción permanece cerrada incluso con una aprobación de prueba", async () => {
  const f = fixture(false);
  try {
    const plan = await f.engine.prepare(input); await f.approve(plan.proposalId);
    await assert.rejects(() => f.engine.commit(plan.proposalId, 1, plan.digest, "one"), { code: "writes_disabled" });
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM home_tasks").get()?.n, 0);
  } finally { f.close(); }
});

test("aprobación, commit atómico, recibo e idempotencia de una ejecución", async () => {
  const f = fixture();
  try {
    const plan = await f.engine.prepare(input); await f.approve(plan.proposalId);
    const result = await f.engine.commit(plan.proposalId, 1, plan.digest, "one");
    assert.equal(result.state, "COMMITTED"); assert.ok(result.revisionAfter > 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM home_tasks").get()?.n, 1);
    assert.deepEqual(await f.engine.commit(plan.proposalId, 1, plan.digest, "one"), result);
    assert.deepEqual(await f.engine.commit(plan.proposalId, 1, plan.digest, "different-key"), result);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM home_tasks").get()?.n, 1);
    const next = await f.engine.prepare(input); await f.approve(next.proposalId);
    await assert.rejects(() => f.engine.commit(next.proposalId, 1, next.digest, "one"), { code: "idempotency_conflict" });
  } finally { f.close(); }
});

test("caducidad, revisión y cancelación invalidan la autorización anterior", async () => {
  const f = fixture();
  try {
    const expired = await f.engine.prepare(input); await f.approve(expired.proposalId); f.advance(600001);
    assert.equal((await f.engine.get(expired.proposalId)).state, "EXPIRED");
    await assert.rejects(() => f.engine.commit(expired.proposalId, 1, expired.digest, "one"));
    const old = await f.engine.prepare(input); await f.approve(old.proposalId);
    const revised = await f.engine.revise(old.proposalId, [{ ...input[0], input: { title: "Revised synthetic task" } }]);
    assert.equal(revised.revision, 2); assert.notEqual(revised.digest, old.digest);
    await assert.rejects(() => f.engine.commit(old.proposalId, 1, old.digest, "two"));
    await f.approve(revised.proposalId); await f.engine.cancel(revised.proposalId);
    await assert.rejects(() => f.engine.commit(revised.proposalId, 2, revised.digest, "three"));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM home_tasks").get()?.n, 0);
  } finally { f.close(); }
});

test("una escritura concurrente de la UI invalida el snapshot sin sobrescribir datos", async () => {
  const f = fixture();
  try {
    const plan = await f.engine.prepare(input); await f.approve(plan.proposalId);
    await runWithDomainDatabase(f.database, () => action(owner.userId, "Synthetic owner", { action: "createTask", title: "Concurrent UI task" }));
    const before = f.snapshot();
    await assert.rejects(() => f.engine.commit(plan.proposalId, 1, plan.digest, "one"), { code: "commit_conflict" });
    assert.equal(f.snapshot(), before);
  } finally { f.close(); }
});

test("un fallo al guardar el recibo revierte datos, revisión y consumo de aprobación", async () => {
  const f = fixture();
  try {
    const plan = await f.engine.prepare(input); await f.approve(plan.proposalId); const before = f.snapshot();
    f.failWhen((sql) => sql.startsWith("INSERT INTO mcp_executions"));
    await assert.rejects(() => f.engine.commit(plan.proposalId, 1, plan.digest, "one"));
    assert.equal(f.snapshot(), before); assert.equal((await f.engine.get(plan.proposalId)).state, "APPROVED");
    f.failWhen(); assert.equal((await f.engine.commit(plan.proposalId, 1, plan.digest, "one")).state, "COMMITTED");
  } finally { f.close(); }
});

test("el payload alterado no coincide con la huella aprobada", async () => {
  const f = fixture();
  try {
    const plan = await f.engine.prepare(input); await f.approve(plan.proposalId);
    const altered = structuredClone(plan.payload); altered.changes[0].after!.updated_at = "tampered";
    f.sqlite.prepare("UPDATE mcp_proposals SET payload=? WHERE proposal_id=?").run(JSON.stringify(altered), plan.proposalId);
    await assert.rejects(() => f.engine.commit(plan.proposalId, 1, plan.digest, "one"), { code: "digest_mismatch" });
  } finally { f.close(); }
});

test("otra identidad no puede leer ni consumir la propuesta", async () => {
  const f = fixture();
  try {
    const plan = await f.engine.prepare(input);
    const other = new ProposalEngine(f.database, { actor: { ...owner, userId: "other" }, registry, verifier, executionEnabled: true });
    await assert.rejects(() => other.get(plan.proposalId), { code: "not_found" });
    await assert.rejects(() => other.requestApproval(plan.proposalId), { code: "not_found" });
  } finally { f.close(); }
});

test("veinte reintentos concurrentes producen un solo efecto y el mismo recibo", async () => {
  const f = fixture();
  try {
    const plan = await f.engine.prepare(input); await f.approve(plan.proposalId);
    const results = await Promise.all(Array.from({ length: 20 }, (_, index) => f.engine.commit(plan.proposalId, 1, plan.digest, `attempt-${index}`)));
    assert.equal(new Set(results.map((result) => result.executionId)).size, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM home_tasks").get()?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM mcp_executions").get()?.n, 1);
  } finally { f.close(); }
});

test("canonicalización determinista, números JSON y rechazo de valores no representables", () => {
  assert.equal(canonicalize({ z: 1, a: [true, null, -0] }), '{"a":[true,null,0],"z":1}');
  for (const value of [NaN, Infinity, undefined, "\ud800", new Date()]) assert.throws(() => canonicalize(value));
});

test("las 18 tablas de staging conservan exactamente las columnas de negocio", () => {
  const f = fixture();
  try {
    for (const table of BUSINESS_TABLES) {
      const columns = (name: string) => f.sqlite.prepare(`PRAGMA table_info(${name})`).all().map((row) => row.name);
      assert.deepEqual(columns(table.name), [...table.columns]);
      assert.deepEqual(columns(`mcp_stage_${table.name}`), ["proposal_id", ...table.columns]);
    }
  } finally { f.close(); }
});

test("revisar o cancelar concurrentemente nunca sobrescribe un COMMITTED", async () => {
  for (const mode of ["revise", "cancel"] as const) {
    const f = fixture();
    try {
      const plan = await f.engine.prepare(input); await f.approve(plan.proposalId);
      await Promise.allSettled([
        f.engine.commit(plan.proposalId, 1, plan.digest, "race"),
        mode === "revise" ? f.engine.revise(plan.proposalId, input) : f.engine.cancel(plan.proposalId),
      ]);
      const receipt = await f.engine.executionResult(plan.proposalId, 1);
      const old = await f.engine.get(plan.proposalId, 1);
      if (receipt) assert.equal(old.state, "COMMITTED");
      else assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM home_tasks").get()?.n, 0);
    } finally { f.close(); }
  }
});
