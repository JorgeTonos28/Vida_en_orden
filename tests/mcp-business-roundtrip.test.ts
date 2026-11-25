import test from "node:test";
import {testDatabase} from "./helpers/d1.ts";
import {businessRoundTrip} from "./helpers/business-roundtrip.ts";
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import assert from "node:assert/strict";
import {getPlatformProxy,unstable_splitSqlQuery} from "wrangler";
test("all 43 operations: signed proposal, execution, exact persistence, read-back, audit and replay (SQLite isolated)",async()=>{
 const f=testDatabase();try{await businessRoundTrip(f.database);}finally{f.close();}
});
test("all 43 operations persist the approved delta under real local D1/workerd",async(t)=>{
 const root=mkdtempSync(join(tmpdir(),"veo-all-operations-")),config=join(root,"wrangler.json");let proxy;
 try{
  writeFileSync(config,JSON.stringify({name:"synthetic-all-operations",compatibility_date:"2026-05-15",compatibility_flags:["nodejs_compat"],d1_databases:[{binding:"DB",database_name:"synthetic-business",database_id:"00000000-0000-4000-8000-000000000000"}]}));
  proxy=await getPlatformProxy<{DB:D1Database}>({configPath:config,envFiles:[],persist:false,remoteBindings:false});
  for(const file of readdirSync(new URL("../drizzle/",import.meta.url)).filter(f=>/^\d{4}.*\.sql$/.test(f)).sort())await proxy.env.DB.batch(unstable_splitSqlQuery(readFileSync(new URL("../drizzle/"+file,import.meta.url),"utf8")).map(sql=>proxy!.env.DB.prepare(sql)));
  t.diagnostic(JSON.stringify(await businessRoundTrip(proxy.env.DB)));
 }finally{await proxy?.dispose();const target=resolve(root);assert.ok(target.startsWith(resolve(tmpdir())+sep)&&target.includes("veo-all-operations-"));rmSync(target,{recursive:true,force:true,maxRetries:8,retryDelay:100});}
});
