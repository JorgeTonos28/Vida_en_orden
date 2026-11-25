import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {domainFixture} from "./helpers/domain.ts";
import {HOUSEHOLD_SCOPE} from "../lib/data-scopes.ts";
import {BUSINESS_TABLES} from "../lib/mcp/plans/tables.ts";

test("legacy data above 2 MiB fails preparation without truncation and cleans staging",async()=>{
 const f=domainFixture();try{
  const description="synthetic-history-".repeat(70_000),insert=f.sqlite.prepare("INSERT INTO home_tasks(id,user_id,title,description,updated_at) VALUES(?,?,?,?,?)");
  for(const id of ["synthetic-large-a","synthetic-large-b"])insert.run(id,HOUSEHOLD_SCOPE,"Synthetic historical task",description,"2026-11-24");
  const checksum=()=>createHash("sha256").update(JSON.stringify(f.sqlite.prepare("SELECT * FROM home_tasks ORDER BY id").all())).digest("hex"),before=checksum();
  await assert.rejects(()=>f.engine.prepare([{actionId:"t",kind:"task.create",input:{title:"Synthetic blocked request"}}]),{code:"snapshot_limit"});
  assert.equal(checksum(),before);assert.equal(f.sqlite.prepare("SELECT count(*) n FROM mcp_stage_leases").get()?.n,0);
  for(const table of BUSINESS_TABLES)assert.equal(f.sqlite.prepare(`SELECT count(*) n FROM mcp_stage_${table.name}`).get()?.n,0);
 }finally{f.close();}
});
