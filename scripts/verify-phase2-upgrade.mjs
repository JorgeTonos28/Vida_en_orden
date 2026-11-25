// Fixed synthetic/local rehearsal. No target URL, credentials or remote DB option.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getPlatformProxy } from 'wrangler';
import { sitesMigrationProjection } from './sites-migration-projection.mjs';
import { runWithDomainDatabase } from '../lib/domain/context.ts';
import { v2Action } from '../lib/domain/v2-service.ts';
import { action } from '../lib/domain/home-service.ts';
import { createMcpReadService } from '../lib/mcp/read-service.ts';
import { canonicalize } from '../lib/mcp/plans/canonical.ts';
import { BUSINESS_TABLES } from '../lib/mcp/plans/tables.ts';
import { runtimeProposalEngine } from '../lib/mcp/plans/runtime.ts';
if (process.argv.length !== 2)
    throw Error('This rehearsal accepts no arguments or targets; it only creates temporary synthetic LOCAL databases.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), scratch = mkdtempSync(join(tmpdir(), 'veo-phase2-upgrade-')), wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
const migrations = sitesMigrationProjection(join(root, 'drizzle')), owner = { userId: 'synthetic-upgrade-owner', email: 'owner@example.test', fullName: null }, date = '2026-11-24', month = '2026-11';
const hash = value => createHash('sha256').update(value).digest('hex');
const env = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_CF_FETCH_ENABLED: 'false' };
delete env.CLOUDFLARE_API_TOKEN;
delete env.CLOUDFLARE_ACCOUNT_ID;
delete env.CLOUDFLARE_API_KEY;
writeFileSync(join(scratch, 'empty.env'), '');
function location(name) { const dir = join(scratch, name), migrationDir = join(dir, 'migrations'), state = join(dir, '.wrangler/state'), config = join(dir, 'wrangler.json'); mkdirSync(migrationDir, { recursive: true }); writeFileSync(config, JSON.stringify({ name: 'synthetic-upgrade-' + name, compatibility_date: '2026-05-15', compatibility_flags: ['nodejs_compat'], d1_databases: [{ binding: 'DB', database_name: 'synthetic-upgrade', database_id: '00000000-0000-4000-8000-000000000000', migrations_dir: migrationDir }] })); return { dir, migrationDir, state, config }; }
function cli(target, args) { assert.ok(args.includes('--local') && !args.includes('--remote')); return execFileSync(process.execPath, [wrangler, 'd1', ...args, '--config', target.config, '--env-file', join(scratch, 'empty.env')], { cwd: target.dir, env, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024, timeout: 120000 }); }
const proxy = target => getPlatformProxy({ configPath: target.config, envFiles: [], persist: { path: join(target.state, 'v3') }, remoteBindings: false });
const source = location('source'), restored = location('restored');
let live;
async function business(db) { const results = await db.batch(BUSINESS_TABLES.map(t => db.prepare(`SELECT ${t.columns.join(',')} FROM ${t.name} ORDER BY ${t.primaryKey}`))); return Object.fromEntries(BUSINESS_TABLES.map((t, i) => [t.name, results[i].results.map(canonicalize).sort()])); }
async function ledger(db) { return (await db.prepare('SELECT id,name,applied_at FROM d1_migrations ORDER BY id').all()).results; }
async function views(db) { const reads = createMcpReadService(db, owner, () => new Date(date + 'T16:00:00Z')); return { accounts: await reads.listAccounts({ as_of: date, include_archived: true, limit: 50 }), budget: await reads.getBudget({ month, limit: 50 }), report: await reads.getFinanceReport({ date_from: date, date_to: date, group_by: 'type', limit: 50 }), references: await reads.validateReferences({ limit: 50 }) }; }
try {
    for (const m of migrations.filter(m => Number(m.file.slice(0, 4)) <= 7))
        writeFileSync(join(source.migrationDir, m.file), m.sql);
    cli(source, ['migrations', 'apply', 'DB', '--local', '--persist-to', source.state]);
    live = await proxy(source);
    const db = live.env.DB;
    const ui = body => runWithDomainDatabase(db, () => v2Action(owner.userId, body), () => new Date(date + 'T16:00:00Z'));
    await runWithDomainDatabase(db, () => action(owner.userId, 'Synthetic owner', { action: 'createTask', title: 'Synthetic preserved task' }));
    const task = (await db.prepare("SELECT id FROM home_tasks WHERE title='Synthetic preserved task'").first()).id;
    await ui({ action: 'area.create', name: 'Synthetic preserved area' });
    const area = (await db.prepare("SELECT id FROM home_areas WHERE name='Synthetic preserved area'").first()).id;
    await ui({ action: 'project.create', name: 'Synthetic preserved project', areaId: area });
    const project = (await db.prepare("SELECT id FROM home_projects WHERE name='Synthetic preserved project'").first()).id;
    await ui({ action: 'event.create', title: 'Synthetic preserved event', startDate: date, allDay: true, linkedTaskId: task, projectId: project });
    for (const [name, openingBalanceMinor, bankName] of [['Synthetic A', 100000, 'Synthetic bank A'], ['Synthetic B', 0, 'Synthetic bank B']])
        await ui({ action: 'finance.account.create', name, type: 'bank', openingBalanceMinor, openingBalanceDate: date, bankName });
    const accounts = (await db.prepare("SELECT id,name FROM finance_accounts WHERE name LIKE 'Synthetic %' ORDER BY name").all()).results, a = accounts[0].id, b = accounts[1].id;
    await ui({ action: 'finance.category.create', name: 'Synthetic preserved category', kind: 'expense' });
    const category = (await db.prepare("SELECT id FROM finance_categories WHERE name='Synthetic preserved category'").first()).id;
    await ui({ action: 'finance.settings.update', timezone: 'America/Santo_Domingo', safetyBufferMinor: 500, transferSameBankRateBps: 0, transferAchRateBps: 5, transferLbtrSurchargeMinor: 100, transferBankFees: {} });
    await ui({ action: 'finance.budget.set', month, categoryId: category, assignedMinor: 20000 });
    await ui({ action: 'finance.transaction.create', type: 'transfer', accountId: a, destinationAccountId: b, amountMinor: 12345, occurredOn: date, description: 'Synthetic preserved transfer', transferMode: 'ach' });
    await ui({ action: 'finance.transaction.create', type: 'expense', accountId: a, categoryId: category, amountMinor: 2500, occurredOn: date, description: 'Synthetic preserved expense', taskId: task, projectId: project });
    await ui({ action: 'finance.obligation.create', title: 'Synthetic preserved obligation', kind: 'expense', expectedAmountMinor: 2000, reservedMinor: 1000, accountId: a, categoryId: category, frequency: 'monthly', nextDueDate: date });
    await ui({ action: 'finance.goal.create', title: 'Synthetic preserved goal', targetMinor: 5000, accountId: a, categoryId: category });
    const goal = (await db.prepare("SELECT id FROM finance_goals WHERE title='Synthetic preserved goal'").first()).id;
    await ui({ action: 'finance.goal.contribute', goalId: goal, amountMinor: 3000, occurredOn: date });
    await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2100) INSERT INTO finance_transactions(id,owner_id,type,account_id,amount_minor,occurred_on,description,status,voided_at,created_at,updated_at) SELECT 'synthetic-old-'||x,?,'expense',?,1,?,'Synthetic preserved history','voided',?,?,? FROM n").bind(owner.userId, a, date, date, date, date).run();
    await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO audit_log(id,owner_id,entity_type,entity_id,action,metadata,occurred_at) SELECT 'synthetic-audit-'||x,?,'task',?,'updated','{}',? FROM n").bind(owner.userId, task, date).run();
    const beforeBusiness = await business(db), beforeViews = await views(db), beforeLedger = await ledger(db);
    assert.equal(beforeLedger.length, 8);
    assert.equal(beforeViews.references.valid, true);
    await live.dispose();
    live = undefined;
    const backup = join(scratch, 'native-phase2.sql'), backupStart = performance.now();
    cli(source, ['export', 'DB', '--local', '--output', backup, '--compatibility', 'd1']);
    const backupMs = performance.now() - backupStart;
    const backupBytes = readFileSync(backup);
    assert.ok(backupBytes.toString('utf8').includes('d1_migrations'), 'Native export omitted migration ledger');
    const second = join(scratch, 'native-phase2-copy.sql');
    cpSync(backup, second);
    assert.equal(hash(readFileSync(second)), hash(backupBytes));
    const restoreStart = performance.now();
    cli(restored, ['execute', 'DB', '--local', '--persist-to', restored.state, '--file', second]);
    const restoreMs = performance.now() - restoreStart;
    live = await proxy(restored);
    assert.equal(canonicalize(await business(live.env.DB)), canonicalize(beforeBusiness));
    assert.deepEqual(await ledger(live.env.DB), beforeLedger);
    assert.equal(canonicalize(await views(live.env.DB)), canonicalize(beforeViews));
    await live.dispose();
    live = undefined;
    for (const m of migrations.filter(m => Number(m.file.slice(0, 4)) <= 11))
        writeFileSync(join(restored.migrationDir, m.file), m.sql);
    const upgradeStart = performance.now();
    cli(restored, ['migrations', 'apply', 'DB', '--local', '--persist-to', restored.state]);
    live = await proxy(restored);
    const intermediateLedger = await ledger(live.env.DB);
    assert.equal(intermediateLedger.length, 12);
    assert.equal(canonicalize(await business(live.env.DB)), canonicalize(beforeBusiness));
    await live.dispose();
    live = undefined;
    const finalMigration = migrations.find(m => m.file.startsWith('0012_'));
    assert.ok(finalMigration, 'Expected the reviewed 0012 migration');
    // Inject a failure AFTER the index DDL, only in this temporary fixture.
    // Native migration atomicity must roll back both DDL and ledger insertion.
    writeFileSync(join(restored.migrationDir, finalMigration.file), finalMigration.sql + "\nINSERT INTO synthetic_missing_table(id) VALUES('synthetic-failure');\n");
    assert.throws(() => cli(restored, ['migrations', 'apply', 'DB', '--local', '--persist-to', restored.state]), error => {
        assert.notEqual(error.status, 0);
        assert.match(String(error.stdout) + String(error.stderr), /synthetic_missing_table/);
        return true;
    });
    live = await proxy(restored);
    assert.deepEqual(await ledger(live.env.DB), intermediateLedger);
    assert.equal(await live.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='audit_log_seed_context_idx'").first(), null, 'Failed migration left partial DDL');
    assert.equal(canonicalize(await business(live.env.DB)), canonicalize(beforeBusiness));
    assert.equal(canonicalize(await views(live.env.DB)), canonicalize(beforeViews));
    await live.dispose();
    live = undefined;
    writeFileSync(join(restored.migrationDir, finalMigration.file), finalMigration.sql);
    cli(restored, ['migrations', 'apply', 'DB', '--local', '--persist-to', restored.state]);
    const upgradeMs = performance.now() - upgradeStart;
    live = await proxy(restored);
    const upgraded = live.env.DB, afterLedger = await ledger(upgraded);
    assert.equal(afterLedger.length, 13);
    assert.deepEqual(afterLedger.slice(0, 8), beforeLedger);
    assert.equal(canonicalize(await business(upgraded)), canonicalize(beforeBusiness));
    assert.equal(canonicalize(await views(upgraded)), canonicalize(beforeViews));
    const userTables = (await upgraded.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results.filter(r => !r.name.startsWith('sqlite_') && !r.name.startsWith('_cf_') && r.name !== 'd1_migrations');
    assert.equal(userTables.length, 48);
    assert.equal((await upgraded.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger'").first()).n, 54);
    assert.deepEqual((await upgraded.prepare('PRAGMA index_info(audit_log_seed_context_idx)').all()).results.map(r => r.name), ['owner_id', 'entity_type', 'entity_id', 'action', 'id']);
    assert.equal(await upgraded.prepare('SELECT installation_id FROM mcp_installation').first(), null, 'Read-only upgrade must not create an installation identity');
    const engine = runtimeProposalEngine(upgraded, owner, { MCP_PROPOSALS_ENABLED: 'true', MCP_APPROVAL_ORIGIN: 'https://approval.example.test', MCP_APPROVAL_CREDENTIALS: '[]' });
    await assert.rejects(() => engine.prepare([{ actionId: 'task', kind: 'task.create', input: { title: 'Synthetic blocked over quota' } }]), { code: 'snapshot_limit' });
    assert.equal(canonicalize(await business(upgraded)), canonicalize(beforeBusiness));
    assert.equal((await engine.health()).businessWritesEnabled, false);
    let d1IntegrityPragmaAvailable = true;
    try {
        assert.equal((await upgraded.prepare('PRAGMA integrity_check').first()).integrity_check, 'ok');
    }
    catch (error) {
        assert.match(String(error), /SQLITE_AUTH|not authorized/i);
        d1IntegrityPragmaAvailable = false;
    }
    const sqliteCopy = new DatabaseSync(':memory:');
    try {
        sqliteCopy.exec(backupBytes.toString('utf8'));
        assert.equal(sqliteCopy.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    }
    finally {
        sqliteCopy.close();
    }
    assert.equal((await upgraded.prepare('PRAGMA foreign_key_check').all()).results.length, 0);
    await live.dispose();
    live = undefined;
    cli(restored, ['migrations', 'apply', 'DB', '--local', '--persist-to', restored.state]);
    live = await proxy(restored);
    assert.deepEqual(await ledger(live.env.DB), afterLedger);
    assert.equal(canonicalize(await business(live.env.DB)), canonicalize(beforeBusiness));
    console.log(JSON.stringify({ status: 'passed', localOnly: true, synthetic: true, nativeWranglerExport: true, ledgerRestored: true, migrationsBefore: 8, migrationsAfter: 13, onlyPendingApplied: 5, failedMigrationRolledBack: true, upgradeIncludesFailureRehearsal: true, repeatApplyNoChange: true, businessPreserved: true, viewsPreserved: true, historicalTransactions: 2100, historicalAudits: 5000, tables: userTables.length, triggers: 54, indexVerified: true, over2000FailsClosed: true, backupBytes: backupBytes.length, backupSha256: hash(backupBytes), backupMs, restoreMs, upgradeMs, d1IntegrityPragmaAvailable, exportedSqliteIntegrityVerified: true, sitesLedgerVerified: false, sitesUpgradeVerified: false }));
}
finally {
    await live?.dispose();
    const target = resolve(scratch);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes('veo-phase2-upgrade-'));
    rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
