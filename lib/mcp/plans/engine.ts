import { financialImpact } from "./financial-impact.ts";
import { initializeRuntimeMetadata, runtimeMetadata, requireRuntimeSchema, requireRuntimeMetadata, MCP_METADATA_VERSION } from "./metadata.ts";
import { webAuthnVerifier } from "./approval.ts";
import { DomainReferenceError } from "../../domain/errors.ts";
import { MAX_QA_PERMIT_MS, qaExecutionAuthorizationSchema, type QaExecutionAuthorization } from "./qa-execution-policy.ts";
import { MCP_BUSINESS_WRITES_ENABLED } from "../future-contracts.ts";
import { queryBudget } from "./budget.ts";
import { parseBoundedJson } from "./limits.ts";
import { z } from "zod";
import { HOUSEHOLD_SCOPE } from "../../data-scopes.ts";
import { dateInTimeZone } from "../../finance-math.ts";
import { domainDatabase, runWithDomainDatabase, type DomainDatabase } from "../../domain/context.ts";
import { createMcpReadService } from "../read-service.ts";
import type { McpIdentity } from "../auth.ts";
import { canonicalize, digest, randomChallenge } from "./canonical.ts";
import { stagingDatabase } from "./staging.ts";
import { BUSINESS_TABLES } from "./tables.ts";
import { PlanError, type ActionRegistry, type ActionResult, type ApprovalVerifier, type ExecutionReceipt, type PlanAction, type PreparedPayload, type Proposal, type ProposalState, type Row, type RowChange, type Snapshot } from "./types.ts";

const actionsSchema = z.array(z.object({ actionId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/), kind: z.string().min(1).max(80), input: z.record(z.string(),z.unknown()) }).strict()).min(1).max(20);
const MAX_SNAPSHOT_ROWS = 2000;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_DIFF_BYTES = 64 * 1024;
const MAX_CHANGED_ROWS = 100;
// History is append-only, not decision state. The domain needs just its seed marker.
const STATE_TABLES = BUSINESS_TABLES.filter(table=>table.name!=="audit_log");
type RevisionBase = { proposalId:string; revision:number; expectedState:ProposalState; expectedDigest:string };
type Stored = { proposal_id: string; revision: number; state: ProposalState; digest: string; payload: string; expires_at: number; base_revision: number };
type EngineOptions = { actor: McpIdentity; registry: ActionRegistry; verifier: ApprovalVerifier; executionEnabled: boolean; authorizeExecution?:()=>Promise<QaExecutionAuthorization>; now?: () => Date; ttlMs?: number; queryLimit?: number };

function changes(before: Snapshot, after: Snapshot, tables:ReadonlyArray<typeof BUSINESS_TABLES[number]> = BUSINESS_TABLES): RowChange[] {
  const result: RowChange[] = [];
  for (const table of tables) {
    const oldRows = new Map(before[table.name].map((row) => [String(row[table.primaryKey]), row]));
    const newRows = new Map(after[table.name].map((row) => [String(row[table.primaryKey]), row]));
    for (const id of new Set([...oldRows.keys(), ...newRows.keys()])) {
      const from = oldRows.get(id) ?? null, to = newRows.get(id) ?? null;
      if (canonicalize(from) !== canonicalize(to)) result.push({ table: table.name, id, before: from, after: to });
    }
  }
  return result;
}

function validMinorColumns(snapshot:Snapshot) {
  for(const table of BUSINESS_TABLES.filter(t=>t.name.startsWith("finance_"))) for(const row of snapshot[table.name]) for(const [key,value] of Object.entries(row)) if(key.endsWith("_minor")&&value!==null&&(!Number.isSafeInteger(value)||Number(value)<0)) throw new PlanError("numeric_limit","La base contiene un importe inválido; requiere revisión de dominio.",400);
}

function resolveReferences(value: unknown, results: Map<string, string | null>): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    if (Object.keys(object).length === 1 && typeof object.$ref === "string") {
      const id = results.get(object.$ref);
      if (!id) throw new PlanError("invalid_reference", "La referencia debe apuntar al resultado de una acción anterior.", 400);
      return id;
    }
    return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, resolveReferences(item, results)]));
  }
  return Array.isArray(value) ? value.map((item) => resolveReferences(item, results)) : value;
}

export class ProposalEngine {
  private database: DomainDatabase;
  private originalDatabase: D1Database;
  private options: EngineOptions;
  constructor(database: D1Database, options: EngineOptions) {
    if (!options.actor.userId || !options.actor.email) throw new PlanError("missing_identity", "Se requiere identidad autenticada.", 401);
    this.database = database.withSession?.("first-primary") ?? database;
    this.originalDatabase = database;
    this.options = options;
  }
  private now() { return this.options.now?.() ?? new Date(); }
  private owner() { return this.options.actor.userId; }
  private async audit(proposalId: string, revision: number, event: string, metrics: Record<string,number> = {}) {
    await this.database.prepare("INSERT INTO mcp_plan_audit(id,owner_id,proposal_id,revision,event,created_at,metrics) VALUES(?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), this.owner(), proposalId, revision, event, this.now().getTime(),JSON.stringify(metrics)).run();
  }
  private async stored(proposalId: string, revision?: number): Promise<Stored> {
    const row = await this.database.prepare(`SELECT p.* FROM mcp_proposals p JOIN mcp_proposal_heads h ON h.proposal_id=p.proposal_id WHERE p.proposal_id=? AND p.owner_id=? AND p.revision=${revision === undefined ? "h.revision" : "?"}`)
      .bind(proposalId, this.owner(), ...(revision === undefined ? [] : [revision])).first<Stored>();
    if (!row) throw new PlanError("not_found", "Propuesta no encontrada.", 404);
    return row;
  }
  async get(proposalId: string, revision?: number): Promise<Proposal> {
    const row = await this.stored(proposalId, revision);
    const state = ["VALIDATED", "PENDING_APPROVAL", "APPROVED"].includes(row.state) && row.expires_at <= this.now().getTime() ? "EXPIRED" : row.state;
    return { proposalId, revision: row.revision, state, digest: row.digest, payload: JSON.parse(row.payload) as PreparedPayload };
  }
  async list() {
    const rows = await this.database.prepare("SELECT p.proposal_id,p.revision,p.state,p.digest,p.expires_at,p.created_at FROM mcp_proposals p JOIN mcp_proposal_heads h ON h.proposal_id=p.proposal_id AND h.revision=p.revision WHERE p.owner_id=? ORDER BY p.created_at DESC LIMIT 50").bind(this.owner()).all<Record<string, unknown>>();
    return rows.results.map((row) => ({ ...row, state: ["VALIDATED", "PENDING_APPROVAL", "APPROVED"].includes(String(row.state)) && Number(row.expires_at) <= this.now().getTime() ? "EXPIRED" : row.state }));
  }
  private async stageRows(stageId: string): Promise<Snapshot> {
    const results = await this.database.batch(BUSINESS_TABLES.map((table) => this.database.prepare(`SELECT ${table.columns.join(",")} FROM mcp_stage_${table.name} WHERE proposal_id=? ORDER BY ${table.primaryKey}`).bind(stageId)));
    return Object.fromEntries(BUSINESS_TABLES.map((table, index) => [table.name, (results[index].results || []).map((row) => Object.fromEntries(table.columns.map((key) => [key, (row as Row)[key] ?? null])) as Row)]));
  }
  private async cleanupStage(stageId: string) {
    await this.database.batch([
      ...BUSINESS_TABLES.map((table) => this.database.prepare(`DELETE FROM mcp_stage_${table.name} WHERE proposal_id=?`).bind(stageId)),
      this.database.prepare("DELETE FROM mcp_execution_guards WHERE execution_id=?").bind(stageId),
      this.database.prepare("DELETE FROM mcp_stage_leases WHERE stage_id=?").bind(stageId),
    ]);
  }
  private async infrastructure() {
    await requireRuntimeSchema(this.database);
  }
  async maintenance() {
    const expired = await this.database.prepare("SELECT stage_id FROM mcp_stage_leases WHERE owner_id=? AND expires_at<=? LIMIT 20").bind(this.owner(),this.now().getTime()).all<{stage_id:string}>();
    for (const lease of expired.results) await this.cleanupStage(lease.stage_id);
    await this.database.prepare("DELETE FROM mcp_approval_challenges WHERE owner_id=? AND expires_at<=?").bind(this.owner(),this.now().getTime()).run();
    return {expiredStagesRemoved:expired.results.length};
  }
  async prepare(input: unknown, idempotencyKey?: string) { return this.prepareVersion(input,undefined,undefined,idempotencyKey); }
  private async prepareVersion(input: unknown, prior?: RevisionBase, requiredBaseRevision?: number, idempotencyKey?: string): Promise<Proposal> {
    await this.infrastructure();
    const raw = JSON.stringify(input);
    if (typeof raw !== "string") throw new PlanError("invalid_input", "El plan requiere JSON.", 400);
    const parsed = actionsSchema.safeParse(parseBoundedJson(raw));
    if (!parsed.success) throw new PlanError("invalid_input", "El plan requiere entre una y veinte acciones con esquema cerrado.", 400);
    if (new Set(parsed.data.map((action) => action.actionId)).size !== parsed.data.length) throw new PlanError("duplicate_action", "Los IDs de acción deben ser únicos.", 400);
    if (idempotencyKey !== undefined && (!idempotencyKey || idempotencyKey.length > 128)) throw new PlanError("invalid_input", "Clave de preparación inválida.", 400);
    await initializeRuntimeMetadata(this.database,this.owner(),this.now().getTime());
    await this.maintenance();
    const keyHash = idempotencyKey === undefined ? null : await digest({ owner: this.owner(), key: idempotencyKey });
    const inputHash = await digest(parsed.data);
    const priorRequest = async () => {
      if (!keyHash) return null;
      const existing = await this.database.prepare("SELECT proposal_id,input_hash FROM mcp_prepare_requests WHERE owner_id=? AND key_hash=?").bind(this.owner(),keyHash).first<{proposal_id:string;input_hash:string}>();
      if (!existing) return null;
      if (existing.input_hash !== inputHash) throw new PlanError("idempotency_conflict", "La clave de preparación corresponde a otras acciones.");
      return this.get(existing.proposal_id,1);
    };
    const repeated = await priorRequest(); if (repeated) return repeated;
    const definitions = parsed.data.map((action) => {
      const definition = this.options.registry.get(action.kind);
      if (!definition) throw new PlanError("unsupported_action", "Operación no soportada por esta versión.", 400);
      return definition;
    });
    const info = await this.database.prepare("SELECT installation_id,business_revision FROM mcp_installation WHERE id=1").first<{ installation_id: string; business_revision: number }>();
    if (!info) throw new PlanError("migration_required", "Falta la migración del motor MCP.", 503);
    if (requiredBaseRevision !== undefined && info.business_revision !== requiredBaseRevision) throw new PlanError("stale_reversal", "Hubo cambios posteriores; prepara una corrección específica.");
    const stageId = crypto.randomUUID();
    const proposalId = prior?.proposalId ?? crypto.randomUUID(), revision = prior?.revision ?? 1;
    const now = this.now(), expiresAt = now.getTime() + Math.min(10 * 60_000, Math.max(1000, this.options.ttlMs ?? 10 * 60_000));
    const scopeValues = STATE_TABLES.map((table) => table.shared ? HOUSEHOLD_SCOPE : this.owner());
    const countSql = STATE_TABLES.map((table) => `(SELECT COUNT(*) FROM ${table.name} WHERE ${table.scopeColumn}=?)`).join("+");
    try { await this.database.batch([
      this.database.prepare(`INSERT INTO mcp_execution_guards(execution_id,valid) SELECT ?,CASE WHEN (${countSql})<=? THEN 1 ELSE 0 END`).bind(stageId, ...scopeValues, MAX_SNAPSHOT_ROWS),
      this.database.prepare("INSERT INTO mcp_stage_leases(stage_id,owner_id,expires_at) VALUES(?,?,?)").bind(stageId,this.owner(),now.getTime()+10*60_000),
      ...BUSINESS_TABLES.map(table=>this.database.prepare(`INSERT INTO mcp_stage_${table.name}(proposal_id,${table.columns.join(",")}) SELECT ?,${table.columns.join(",")} FROM ${table.name} WHERE ${table.scopeColumn}=?${table.name==="audit_log"?" AND entity_type='system' AND entity_id='concepts-v1' AND action='seeded' ORDER BY id LIMIT 1":""}`).bind(stageId,table.shared?HOUSEHOLD_SCOPE:this.owner())),
    ]); } catch(error) { if(error instanceof Error && /CHECK constraint failed.*valid/i.test(error.message)) throw new PlanError("snapshot_limit","El estado de dominio excede 2.000 filas (sin historial de auditoría); requiere preparación por conjuntos de lectura.",413); throw new PlanError("staging_failed","No se pudo preparar staging; comprobar migraciones y cuota D1.",503); }
    try {
      const before = await this.stageRows(stageId);
      validMinorColumns(before);
      if (new TextEncoder().encode(canonicalize(before)).byteLength > MAX_SNAPSHOT_BYTES) throw new PlanError("snapshot_limit", "La base excede el límite seguro de preparación.", 413);
      const budget = queryBudget(this.database, Math.min(400,Math.max(1,this.options.queryLimit ?? 400)));
      const touched = new Set<string>();
      const stage = stagingDatabase(budget.database, stageId,table=>touched.add(table));
      const reads = createMcpReadService(stage,this.options.actor,()=>now);
      const hasFinance = definitions.some(definition=>definition.phase===5);
      const month = dateInTimeZone(now,"America/Santo_Domingo").slice(0,7);
      const beforeFinance = hasFinance ? await reads.getBudget({month,limit:1}) as {summary:Record<string,number>} : null;
      let previous = before;
      const resolved: PlanAction[] = [], results: ActionResult[] = [], references = new Map<string, string | null>();
      for (const [index, action] of parsed.data.entries()) {
        const definition = definitions[index];
        const validated = definition.schema.safeParse(resolveReferences(action.input, references));
        if (!validated.success) throw new PlanError("invalid_input", `Argumentos inválidos en ${action.actionId}.`, 400);
        const target = BUSINESS_TABLES.find((table) => table.name === definition.targetTable)!;
        const oldIds = new Set(previous[target.name].map(row=>String(row[target.primaryKey])));
        touched.clear();
        let value: unknown;
        try { value = await runWithDomainDatabase(stage, () => definition.execute(this.options.actor, validated.data), () => now); }
        catch (error) {
          if (error instanceof DomainReferenceError) throw new PlanError("reference_not_found", "Una referencia no existe o no está disponible en el alcance autorizado.", 404);
          throw error; // Infrastructure and unknown failures must not be misclassified.
        }
        const tables = BUSINESS_TABLES.filter(table=>touched.has(table.name));
        // Engine-owned snapshots read their exact partition; the domain wrapper
        // deliberately refuses arbitrary reads of its partial audit context.
        const snapshots = tables.length ? await budget.database.batch(tables.map(table=>budget.database.prepare(`SELECT ${table.columns.join(",")} FROM mcp_stage_${table.name} WHERE proposal_id=? ORDER BY ${table.primaryKey}`).bind(stageId))) : [];
        const next = {...previous};for(const [tableIndex,table] of tables.entries())next[table.name]=snapshots[tableIndex].results.map(row=>Object.fromEntries(table.columns.map(column=>[column,(row as Row)[column]??null])) as Row);
        const effects = changes(previous,next,tables);previous=next;
        const returnedId = value && typeof value === "object" && "id" in value ? String(value.id) : null;
        let entityId = returnedId;
        if (!entityId) {
          const created = next[target.name].map((row) => String(row[target.primaryKey])).filter((id) => !oldIds.has(id));
          if (created.length === 1) entityId = created[0];
        }
        if(!entityId&&typeof validated.data.id==="string")entityId=validated.data.id;
        references.set(action.actionId, entityId);
        results.push({ actionId: action.actionId, kind: action.kind, entityId, effects });
        resolved.push({ ...action, input: validated.data });
      }
      const integrity = await createMcpReadService(stage, this.options.actor).validateReferences({ limit: 50 }) as { valid: boolean };
      if (!integrity.valid) throw new PlanError("invalid_reference", "El plan produciría referencias inválidas.", 400);
      const after = await this.stageRows(stageId);validMinorColumns(after);
      const delta = changes(before, after);
      if (delta.length > MAX_CHANGED_ROWS || new TextEncoder().encode(canonicalize(delta)).byteLength > MAX_DIFF_BYTES) throw new PlanError("diff_limit", "El cambio excede el límite seguro; divide el plan.", 413);
      const afterFinance = hasFinance ? await reads.getBudget({month,limit:1}) as {summary:Record<string,number>} : null;
      const impact = beforeFinance && afterFinance ? financialImpact(before,after,beforeFinance.summary,afterFinance.summary,now) : null;
      if(impact && ![...Object.values(impact.before),...Object.values(impact.after),...impact.accounts.flatMap(a=>[a.beforeMinor??0,a.afterMinor??0])].every(Number.isSafeInteger))throw new PlanError("numeric_limit","El impacto excede el rango entero seguro.",400);
      const payload: PreparedPayload = { ...(impact?{financialImpact:impact}:{}), contractVersion: 1, metadataVersion:MCP_METADATA_VERSION, installationId: info.installation_id, ownerId: this.owner(), proposalId, revision, createdAt: now.getTime(), expiresAt, contextDate: dateInTimeZone(now, "America/Santo_Domingo"), baseRevision: info.business_revision, actions: resolved, changes: delta, results, risk: definitions.some((definition) => definition.risk === "R2") || delta.some(change=>change.table.startsWith("finance_")||change.table==="home_movements") ? "R2" : "R1" };
      if(new TextEncoder().encode(canonicalize(payload)).byteLength>128*1024)throw new PlanError("diff_limit","La propuesta completa excede 128 KiB; divide el plan.",413);
      const fingerprint = await digest({ domain: "vida-en-orden/proposal/v1", payload });
      const revisionGuard = crypto.randomUUID();
      try { await this.database.batch([
        ...(prior ? [this.database.prepare("INSERT INTO mcp_execution_guards(execution_id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM mcp_proposal_heads h JOIN mcp_proposals p ON p.proposal_id=h.proposal_id AND p.revision=h.revision WHERE h.proposal_id=? AND h.owner_id=? AND p.owner_id=h.owner_id AND h.revision=? AND p.state=? AND p.digest=? AND p.state<>'COMMITTED') THEN 1 ELSE 0 END").bind(revisionGuard, proposalId, this.owner(), revision - 1,prior.expectedState,prior.expectedDigest)] : []),
        ...(prior ? [] : [this.database.prepare("INSERT INTO mcp_proposal_heads(proposal_id,owner_id,revision) VALUES(?,?,?)").bind(proposalId, this.owner(), revision)]),
        this.database.prepare("INSERT INTO mcp_proposals(proposal_id,revision,owner_id,state,digest,payload,base_revision,expires_at,created_at) VALUES(?,?,?,'VALIDATED',?,?,?,?,?)").bind(proposalId, revision, this.owner(), fingerprint, canonicalize(payload), info.business_revision, expiresAt, now.getTime()),
        ...(prior ? [
          this.database.prepare("UPDATE mcp_proposals SET state='INVALIDATED' WHERE proposal_id=? AND revision=? AND owner_id=?").bind(proposalId,revision-1,this.owner()),
          this.database.prepare("DELETE FROM mcp_approvals WHERE proposal_id=? AND revision=? AND owner_id=?").bind(proposalId,revision-1,this.owner()),
          this.database.prepare("UPDATE mcp_approval_challenges SET used=1 WHERE proposal_id=? AND revision=? AND owner_id=?").bind(proposalId,revision-1,this.owner()),
          this.database.prepare("INSERT INTO mcp_plan_audit(id,owner_id,proposal_id,revision,event,created_at) VALUES(?,?,?,?,'invalidated',?)").bind(crypto.randomUUID(),this.owner(),proposalId,revision-1,this.now().getTime()),
        ] : []),
        this.database.prepare("INSERT INTO mcp_plan_audit(id,owner_id,proposal_id,revision,event,created_at,metrics) VALUES(?,?,?,?,'prepared',?,?)").bind(crypto.randomUUID(),this.owner(),proposalId,revision,this.now().getTime(),JSON.stringify(budget.stats())),
        ...(keyHash ? [this.database.prepare("INSERT INTO mcp_prepare_requests(owner_id,key_hash,input_hash,proposal_id) VALUES(?,?,?,?)").bind(this.owner(),keyHash,inputHash,proposalId)] : []),
        ...(prior ? [this.database.prepare("UPDATE mcp_proposal_heads SET revision=? WHERE proposal_id=? AND owner_id=? AND revision=?").bind(revision, proposalId, this.owner(),revision-1), this.database.prepare("DELETE FROM mcp_execution_guards WHERE execution_id=?").bind(revisionGuard)] : []),
      ]); } catch (error) {
        const existing = await priorRequest(); if (existing) return existing;
        if(prior){if(error instanceof Error&&/CHECK constraint failed.*valid/i.test(error.message))throw new PlanError("stale_proposal","La propuesta cambió durante la preparación; consulta su revisión actual.");throw new PlanError("revision_failed","No se publicó la nueva revisión; consulta el estado antes de reintentar.",503);}
        throw error;
      }

      return { proposalId, revision, state: "VALIDATED", digest: fingerprint, payload };
    } finally { try{await this.cleanupStage(stageId);}catch{/* Keep the lease for maintenance; cleanup must not hide a publication or its original error. */} }
  }
  /** Server-derived inverse only; no table, row or patch is accepted from the caller. */
  async prepareReversal(proposalId: string, revision: number): Promise<Proposal> {
    const original = await this.get(proposalId, revision);
    const receipt = await this.executionResult(proposalId, revision);
    if (!receipt || original.state !== "COMMITTED" || await digest({ domain: "vida-en-orden/proposal/v1", payload: original.payload }) !== original.digest) throw new PlanError("invalid_reversal", "Solo se revierte una ejecución íntegra y confirmada.");
    const allowed = new Set(["home_tasks", "home_notes", "home_workspaces", "home_areas", "home_projects", "calendar_events"]);
    if (original.payload.actions.some((action) => this.options.registry.get(action.kind)?.phase !== 4) || original.payload.changes.some((change) => !allowed.has(change.table) && change.table !== "audit_log" && !(!change.before && change.table.startsWith("finance_")))) throw new PlanError("invalid_reversal", "Las finanzas requieren anulación o compensación de dominio, no un rollback de filas.");
    const delta = original.payload.changes.filter((change) => allowed.has(change.table));
    const kind = "system.reverse_non_financial";
    const registry = new Map(this.options.registry);
    registry.set(kind, { kind, phase: 4, risk: "R2", targetTable: "home_tasks", schema: z.object({ sourceProposalId: z.literal(proposalId), sourceRevision: z.literal(revision) }).strict(),
      async execute() {
        const database = domainDatabase();
        for (const change of [...delta].reverse()) {
          const table = BUSINESS_TABLES.find((entry) => entry.name === change.table)!;
          if (!change.before) await database.prepare(`DELETE FROM ${table.name} WHERE ${table.primaryKey}=?`).bind(change.id).run();
          else if (change.after) await database.prepare(`UPDATE ${table.name} SET ${table.columns.filter((column) => column !== table.primaryKey).map((column) => `${column}=?`).join(",")} WHERE ${table.primaryKey}=?`).bind(...table.columns.filter((column) => column !== table.primaryKey).map((column) => change.before![column]),change.id).run();
          else await database.prepare(`INSERT INTO ${table.name}(${table.columns.join(",")}) VALUES(${table.columns.map(() => "?").join(",")})`).bind(...table.columns.map((column) => change.before![column])).run();
        }
      },
    });
    return new ProposalEngine(this.originalDatabase, { ...this.options, registry }).prepareVersion([{ actionId: "reverse", kind, input: { sourceProposalId: proposalId, sourceRevision: revision } }], undefined, receipt.revisionAfter);
  }
  async revise(proposalId: string, input: unknown, expectedRevision?: number) {
    const old = await this.stored(proposalId);
    if (expectedRevision !== undefined && old.revision !== expectedRevision) throw new PlanError("stale_proposal","La revisión cambió; consulta el estado actual.");
    if (old.state === "COMMITTED") throw new PlanError("already_committed", "Prepara una operación de reversión independiente.");
    // The current version stays usable throughout staging. Only the guarded
    // publication batch replaces its head and revokes its authorization.
    return this.prepareVersion(input, { proposalId, revision: old.revision + 1,expectedState:old.state,expectedDigest:old.digest });
  }
  async cancel(proposalId: string, expectedRevision?: number) {
    const proposal = await this.stored(proposalId);
    if (expectedRevision !== undefined && proposal.revision !== expectedRevision) throw new PlanError("stale_proposal","La revisión cambió; consulta el estado actual.");
    if (proposal.state === "COMMITTED") throw new PlanError("already_committed", "La ejecución ya fue confirmada.");
    const guard = crypto.randomUUID();
    await this.database.batch([
      this.database.prepare("INSERT INTO mcp_execution_guards(execution_id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM mcp_proposals p JOIN mcp_proposal_heads h ON h.proposal_id=p.proposal_id AND h.revision=p.revision WHERE p.proposal_id=? AND p.revision=? AND p.owner_id=? AND p.state<>'COMMITTED') THEN 1 ELSE 0 END").bind(guard, proposalId, proposal.revision, this.owner()),
      this.database.prepare("UPDATE mcp_proposals SET state='CANCELLED' WHERE proposal_id=? AND revision=? AND owner_id=? AND state<>'COMMITTED'").bind(proposalId, proposal.revision, this.owner()),
      this.database.prepare("INSERT INTO mcp_plan_audit(id,owner_id,proposal_id,revision,event,created_at) VALUES(?,?,?,?,'cancelled',?)").bind(crypto.randomUUID(),this.owner(),proposalId,proposal.revision,this.now().getTime()),
      this.database.prepare("DELETE FROM mcp_approvals WHERE proposal_id=? AND revision=? AND owner_id=?").bind(proposalId, proposal.revision, this.owner()),
      this.database.prepare("DELETE FROM mcp_execution_guards WHERE execution_id=?").bind(guard),
    ]);
    return this.get(proposalId);
  }
  async requestApproval(proposalId: string) {
    const proposal = await this.get(proposalId);
    await requireRuntimeMetadata(this.database);
    if(proposal.payload.metadataVersion!==MCP_METADATA_VERSION)throw new PlanError("proposal_version_unsupported","Prepara una propuesta nueva con esta versión del motor.",403);
    if (!["VALIDATED", "PENDING_APPROVAL"].includes(proposal.state)) throw new PlanError("invalid_state", "La propuesta no admite aprobación.");
    if (await digest({domain:"vida-en-orden/proposal/v1",payload:proposal.payload}) !== proposal.digest) throw new PlanError("digest_mismatch","La propuesta fue alterada.",403);
    const challenge = randomChallenge();
    await this.database.batch([
      this.database.prepare("DELETE FROM mcp_approval_challenges WHERE proposal_id=? AND revision=? AND owner_id=? AND used=0").bind(proposalId,proposal.revision,this.owner()),
      this.database.prepare("UPDATE mcp_proposals SET state='PENDING_APPROVAL' WHERE proposal_id=? AND revision=? AND owner_id=? AND state='VALIDATED'").bind(proposalId, proposal.revision, this.owner()),
      this.database.prepare("INSERT INTO mcp_approval_challenges(challenge,proposal_id,revision,owner_id,digest,expires_at) VALUES(?,?,?,?,?,?)").bind(challenge, proposalId, proposal.revision, this.owner(), proposal.digest, proposal.payload.expiresAt),
      this.database.prepare("INSERT INTO mcp_plan_audit(id,owner_id,proposal_id,revision,event,created_at) VALUES(?,?,?,?,'approval_requested',?)").bind(crypto.randomUUID(),this.owner(),proposalId,proposal.revision,this.now().getTime()),
    ]);
    return { proposalId, revision: proposal.revision, digest: proposal.digest, challenge, expiresAt: proposal.payload.expiresAt };
  }
  async approve(proposalId: string, challenge: string, proof: unknown) {
    const proposal = await this.get(proposalId);
    await requireRuntimeMetadata(this.database);
    if(proposal.payload.metadataVersion!==MCP_METADATA_VERSION)throw new PlanError("proposal_version_unsupported","Prepara una propuesta nueva con esta versión del motor.",403);
    const nonce = await this.database.prepare("SELECT challenge FROM mcp_approval_challenges WHERE challenge=? AND proposal_id=? AND revision=? AND owner_id=? AND digest=? AND used=0 AND expires_at>?").bind(challenge, proposalId, proposal.revision, this.owner(), proposal.digest, this.now().getTime()).first();
    if (!nonce || proposal.state !== "PENDING_APPROVAL") throw new PlanError("invalid_approval", "Aprobación inválida, vencida o consumida.", 403);
    let verified: Awaited<ReturnType<ApprovalVerifier["verify"]>>;
    try { verified = await this.options.verifier.verify(proof, challenge, this.options.actor); }
    catch { try { await this.audit(proposalId,proposal.revision,"approval_denied"); } catch { /* A denial never grants approval, including when its telemetry fails. */ } throw new PlanError("invalid_approval", "No se pudo verificar la acción humana.", 403); }
    if (this.options.verifier.channel === "webauthn" && !verified.evidence) throw new PlanError("invalid_approval","Falta evidencia verificable.",403);
    const evidence = canonicalize({channel:this.options.verifier.channel,...(verified.evidence || {proof})});
    const guard = crypto.randomUUID();
    await this.database.batch([
      this.database.prepare("INSERT INTO mcp_execution_guards(execution_id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM mcp_proposals p JOIN mcp_proposal_heads h ON h.proposal_id=p.proposal_id AND h.revision=p.revision JOIN mcp_approval_challenges c ON c.proposal_id=p.proposal_id AND c.revision=p.revision WHERE p.proposal_id=? AND p.owner_id=? AND p.state='PENDING_APPROVAL' AND p.digest=? AND p.expires_at>? AND c.challenge=? AND c.owner_id=p.owner_id AND c.digest=p.digest AND c.expires_at=p.expires_at AND c.used=0 AND EXISTS(SELECT 1 FROM mcp_installation WHERE id=1 AND metadata_version=1)) THEN 1 ELSE 0 END").bind(guard, proposalId, this.owner(), proposal.digest, this.now().getTime(), challenge),
      this.database.prepare("INSERT INTO mcp_approvals(proposal_id,revision,owner_id,digest,challenge,credential_id,expires_at,approved_at) VALUES(?,?,?,?,?,?,?,?)").bind(proposalId, proposal.revision, this.owner(), proposal.digest, challenge, verified.credentialId, proposal.payload.expiresAt, this.now().getTime()),
      this.database.prepare("INSERT INTO mcp_approval_evidence(proposal_id,revision,owner_id,digest,challenge,credential_id,evidence,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(proposalId,proposal.revision,this.owner(),proposal.digest,challenge,verified.credentialId,evidence,this.now().getTime()),
      this.database.prepare("INSERT INTO mcp_plan_audit(id,owner_id,proposal_id,revision,event,created_at) VALUES(?,?,?,?,'approved',?)").bind(crypto.randomUUID(),this.owner(),proposalId,proposal.revision,this.now().getTime()),
      this.database.prepare("UPDATE mcp_approval_challenges SET used=1 WHERE challenge=?").bind(challenge),
      this.database.prepare("UPDATE mcp_proposals SET state='APPROVED' WHERE proposal_id=? AND revision=? AND owner_id=?").bind(proposalId, proposal.revision, this.owner()),
      this.database.prepare("DELETE FROM mcp_execution_guards WHERE execution_id=?").bind(guard),
    ]);
    return this.get(proposalId);
  }
  async executionResult(proposalId: string, revision: number): Promise<ExecutionReceipt | null> {
    const row = await this.database.prepare("SELECT result FROM mcp_executions WHERE proposal_id=? AND revision=? AND owner_id=?").bind(proposalId, revision, this.owner()).first<{ result: string }>();
    return row ? JSON.parse(row.result) as ExecutionReceipt : null;
  }
  private async requireExecutionAuthorization(): Promise<QaExecutionAuthorization> {
    try {
      if (typeof this.options.authorizeExecution !== "function") throw Error("Missing authorizer");
      const authorization = qaExecutionAuthorizationSchema.parse(await this.options.authorizeExecution());
      const now = this.now().getTime();
      if (!Number.isSafeInteger(now) || authorization.expiresAt <= now || authorization.expiresAt - now > MAX_QA_PERMIT_MS) throw Error("Invalid authorization window");
      return authorization;
    } catch {
      throw new PlanError("writes_disabled", "La ejecución QA no tiene una autorización válida y vigente.", 403);
    }
  }
  async businessWritesEnabled():Promise<boolean>{
    if(!MCP_BUSINESS_WRITES_ENABLED||!this.options.executionEnabled)return false;
    try{await this.requireExecutionAuthorization();return true;}catch{return false;}
  }
  async health() {
    await this.infrastructure();
    const metadata=await runtimeMetadata(this.database);
    const counts = await this.database.prepare("SELECT CASE WHEN p.expires_at<=? AND p.state IN ('VALIDATED','PENDING_APPROVAL','APPROVED') THEN 'EXPIRED' ELSE p.state END state,COUNT(*) total FROM mcp_proposals p JOIN mcp_proposal_heads h ON h.proposal_id=p.proposal_id AND h.revision=p.revision WHERE p.owner_id=? GROUP BY 1").bind(this.now().getTime(),this.owner()).all<{state:string;total:number}>();
    const leases = await this.database.prepare("SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN expires_at<=? THEN 1 ELSE 0 END),0) expired FROM mcp_stage_leases WHERE owner_id=?").bind(this.now().getTime(),this.owner()).first<{total:number;expired:number}>();
    return {schemaReady:true,metadataReady:metadata?.metadata_version===MCP_METADATA_VERSION,metadataVersion:metadata?.metadata_version??0,proposalsByState:counts.results,staging:leases,businessWritesEnabled:await this.businessWritesEnabled(),limits:{actions:20,rows:MAX_SNAPSHOT_ROWS,rowLimitScope:"non_audit_source_rows",auditContextRows:1,auditHistoryIncluded:false,snapshotBytes:MAX_SNAPSHOT_BYTES,diffRows:MAX_CHANGED_ROWS,diffBytes:MAX_DIFF_BYTES,domainQueries:400,prepareMilliseconds:60000}};
  }
  async verifyExecution(proposalId:string,revision:number) {
    const receipt = await this.executionResult(proposalId,revision);if(!receipt)return {receiptPresent:false};
    const proposal = await this.get(proposalId,revision);
    const digestVerified = proposal.digest===receipt.digest && await digest({domain:"vida-en-orden/proposal/v1",payload:proposal.payload})===receipt.digest;
    if(!digestVerified)return {receiptPresent:true,digestVerified:false,stillMatches:false};
    const statements = proposal.payload.changes.map(change=>{const table=BUSINESS_TABLES.find(t=>t.name===change.table);if(!table)throw new PlanError("invalid_delta","Tabla no autorizada.",403);return this.database.prepare(`SELECT ${table.columns.join(",")} FROM ${table.name} WHERE ${table.primaryKey}=?`).bind(change.id);});
    statements.push(this.database.prepare("SELECT business_revision FROM mcp_installation WHERE id=1"));
    const rows=await this.database.batch(statements);
    const stillMatches=proposal.payload.changes.every((change,index)=>canonicalize(rows[index].results[0]||null)===canonicalize(change.after));
    const revisionMatches=Number((rows.at(-1)?.results[0] as {business_revision:number})?.business_revision)===receipt.revisionAfter;
    const evidence=await this.database.prepare("SELECT challenge,credential_id,evidence FROM mcp_approval_evidence WHERE proposal_id=? AND revision=? AND owner_id=? AND digest=?").bind(proposalId,revision,this.owner(),receipt.digest).first<{challenge:string;credential_id:string;evidence:string}>();
    let signatureVerified=false,channel="missing";
    if(evidence){try{const archived=JSON.parse(evidence.evidence) as {channel:string;origin:string;publicKey:string;proof:unknown};channel=archived.channel;if(channel==="webauthn"){const verified=await webAuthnVerifier({origin:archived.origin,credentials:[{ownerId:this.owner(),id:evidence.credential_id,publicKey:archived.publicKey}]}).verify(archived.proof,evidence.challenge,this.options.actor);signatureVerified=verified.credentialId===evidence.credential_id;}}catch{signatureVerified=false;}}
    return {receiptPresent:true,digestVerified,stillMatches,revisionMatches,checkedRows:proposal.payload.changes.length,approvalEvidence:{channel,signatureVerifiedAgainstRecordedKey:signatureVerified},note:revisionMatches?"Verificación actual del diff persistido.":"Hubo cambios posteriores; el recibo original conserva su estado histórico."};
  }
  async commitFromMcp(proposalId:string,revision:number,fingerprint:string,key:string):Promise<ExecutionReceipt>{
    if(!MCP_BUSINESS_WRITES_ENABLED||!this.options.authorizeExecution)throw new PlanError("writes_disabled","Las escrituras MCP reales permanecen deshabilitadas.",403);
    return this.commit(proposalId,revision,fingerprint,key);
  }
  async commit(proposalId: string, revision: number, fingerprint: string, key: string): Promise<ExecutionReceipt> {
    if (!/^[a-f0-9]{64}$/.test(fingerprint) || !Number.isSafeInteger(revision) || revision < 1 || !key || key.length > 128) throw new PlanError("invalid_input", "Solicitud de ejecución inválida.", 400);
    const idempotencyHash = await digest({ owner: this.owner(), key });
    const used = await this.database.prepare("SELECT proposal_id,revision FROM mcp_executions WHERE owner_id=? AND idempotency_hash=?").bind(this.owner(), idempotencyHash).first<{ proposal_id: string; revision: number }>();
    if (used && (used.proposal_id !== proposalId || used.revision !== revision)) throw new PlanError("idempotency_conflict", "La clave pertenece a otra propuesta.");
    const existing = await this.executionResult(proposalId, revision);
    if (existing) { if (existing.digest !== fingerprint) throw new PlanError("digest_mismatch", "La huella no coincide."); return existing; }
    if (!this.options.executionEnabled) throw new PlanError("writes_disabled", "Las escrituras MCP reales permanecen deshabilitadas.", 403);
    const executionAuthorization = await this.requireExecutionAuthorization();
    const proposal = await this.get(proposalId, revision);
    await requireRuntimeMetadata(this.database);
    if(proposal.payload.metadataVersion!==MCP_METADATA_VERSION)throw new PlanError("proposal_version_unsupported","Prepara una propuesta nueva con esta versión del motor.",403);
    if (proposal.state === "COMMITTED") {
      const concurrent = await this.executionResult(proposalId, revision);
      if (concurrent?.digest === fingerprint) return concurrent;
    }
    if (proposal.state !== "APPROVED") throw new PlanError("approval_required", "Se requiere aprobación humana vigente.", 403);
    if (proposal.digest !== fingerprint || await digest({ domain: "vida-en-orden/proposal/v1", payload: proposal.payload }) !== fingerprint) throw new PlanError("digest_mismatch", "La propuesta fue alterada.", 403);
    if (dateInTimeZone(this.now(), "America/Santo_Domingo") !== proposal.payload.contextDate) throw new PlanError("stale_proposal", "Cambió la fecha de cálculo; prepara nuevamente.");
    const evidence = await this.database.prepare("SELECT e.*,a.credential_id active_credential FROM mcp_approval_evidence e JOIN mcp_approvals a ON a.proposal_id=e.proposal_id AND a.revision=e.revision AND a.owner_id=e.owner_id AND a.digest=e.digest AND a.challenge=e.challenge WHERE e.proposal_id=? AND e.revision=? AND e.owner_id=? AND e.digest=?").bind(proposalId,revision,this.owner(),fingerprint).first<{evidence:string;challenge:string;credential_id:string;active_credential:string}>();
    if (!evidence || evidence.credential_id !== evidence.active_credential) {
      const concurrent = await this.executionResult(proposalId,revision);if(concurrent?.digest===fingerprint)return concurrent;
      throw new PlanError("approval_evidence_required","Falta evidencia íntegra de aprobación.",403);
    }
    try {
      const archived = JSON.parse(evidence.evidence) as {channel:string;proof:unknown};
      if (archived.channel !== this.options.verifier.channel || (await this.options.verifier.verify(archived.proof,evidence.challenge,this.options.actor)).credentialId !== evidence.credential_id) throw Error("revoked");
    } catch { const concurrent = await this.executionResult(proposalId,revision);if(concurrent?.digest===fingerprint)return concurrent;throw new PlanError("approval_revoked","La credencial ya no es válida; prepara y aprueba nuevamente.",403); }
    const executionId = crypto.randomUUID();
    const executionDeadline = Math.min(executionAuthorization.expiresAt, proposal.payload.expiresAt);
    const statements = [this.database.prepare("INSERT INTO mcp_execution_guards(execution_id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM mcp_proposals p JOIN mcp_proposal_heads h ON h.proposal_id=p.proposal_id AND h.revision=p.revision JOIN mcp_approvals a ON a.proposal_id=p.proposal_id AND a.revision=p.revision JOIN mcp_approval_evidence e ON e.proposal_id=a.proposal_id AND e.revision=a.revision AND e.owner_id=a.owner_id AND e.digest=a.digest AND e.challenge=a.challenge AND e.credential_id=a.credential_id JOIN mcp_installation i ON i.id=1 WHERE p.proposal_id=? AND p.revision=? AND p.owner_id=? AND p.state='APPROVED' AND p.digest=? AND p.expires_at>? AND a.expires_at>? AND a.owner_id=p.owner_id AND a.digest=p.digest AND i.installation_id=? AND i.business_revision=p.base_revision AND i.metadata_version=1 AND e.evidence=? AND a.credential_id=? AND ? > CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) THEN 1 ELSE 0 END").bind(executionId, proposalId, revision, this.owner(), fingerprint, this.now().getTime(), this.now().getTime(), proposal.payload.installationId,evidence.evidence,evidence.credential_id,executionDeadline)];
    statements.push(this.database.prepare("INSERT INTO mcp_plan_audit(id,owner_id,proposal_id,revision,event,created_at,metrics) VALUES(?,?,?,?,'qa_execution_authorized',?,?)").bind(crypto.randomUUID(),this.owner(),proposalId,revision,this.now().getTime(),JSON.stringify(executionAuthorization)));
    for (const change of proposal.payload.changes) {
      const table = BUSINESS_TABLES.find((entry) => entry.name === change.table);
      if (!table) throw new PlanError("invalid_delta", "Tabla no autorizada.", 403);
      if(table.name==="audit_log"&&(change.before!==null||change.after===null))throw new PlanError("invalid_delta","El historial de auditoría solo admite nuevas entradas.",403);
      if (change.after) {
        const columns = table.columns as readonly string[];
        if (change.before) statements.push(this.database.prepare(`UPDATE ${table.name} SET ${columns.filter((column) => column !== table.primaryKey).map((column) => `${column}=?`).join(",")} WHERE ${table.primaryKey}=?`).bind(...columns.filter((column) => column !== table.primaryKey).map((column) => change.after![column]), change.id));
        else statements.push(this.database.prepare(`INSERT INTO ${table.name}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`).bind(...columns.map((column) => change.after![column])));
      } else statements.push(this.database.prepare(`DELETE FROM ${table.name} WHERE ${table.primaryKey}=?`).bind(change.id));
    }
    const receipt: ExecutionReceipt = { executionId, proposalId, revision, digest: fingerprint, state: "COMMITTED", results: proposal.payload.results, changes: proposal.payload.changes.length, revisionAfter: 0 };
    statements.push(
      this.database.prepare("INSERT INTO audit_log(id,owner_id,entity_type,entity_id,action,metadata,occurred_at) VALUES(?,?,'mcp_plan',?,'committed',?,?)").bind(crypto.randomUUID(), this.owner(), proposalId, JSON.stringify({ revision, kinds: proposal.payload.actions.map((action) => action.kind) }), this.now().toISOString()),
      this.database.prepare("UPDATE mcp_proposals SET state='COMMITTED' WHERE proposal_id=? AND revision=? AND owner_id=?").bind(proposalId, revision, this.owner()),
      this.database.prepare("DELETE FROM mcp_approvals WHERE proposal_id=? AND revision=? AND owner_id=?").bind(proposalId, revision, this.owner()),
      this.database.prepare("INSERT INTO mcp_executions(execution_id,proposal_id,revision,owner_id,idempotency_hash,result,created_at) VALUES(?,?,?,?,?,json_set(?,'$.revisionAfter',(SELECT business_revision FROM mcp_installation WHERE id=1)),?)").bind(executionId, proposalId, revision, this.owner(), idempotencyHash, JSON.stringify(receipt), this.now().getTime()),
      this.database.prepare("INSERT INTO mcp_plan_audit(id,owner_id,proposal_id,revision,event,created_at) VALUES(?,?,?,?,'committed',?)").bind(crypto.randomUUID(), this.owner(), proposalId, revision, this.now().getTime()),
      this.database.prepare("DELETE FROM mcp_execution_guards WHERE execution_id=?").bind(executionId),
    );
    try { await this.database.batch(statements); }
    catch {
      const concurrent = await this.executionResult(proposalId, revision);
      if (concurrent && concurrent.digest === fingerprint) return concurrent;
      throw new PlanError("commit_conflict", "La ejecución no se confirmó: cambió la propuesta, sus datos o falló el lote.");
    }
    const result = await this.executionResult(proposalId, revision);
    if (!result) throw new PlanError("execution_uncertain", "Consulta el resultado antes de reintentar.", 503);
    return result;
  }
}
