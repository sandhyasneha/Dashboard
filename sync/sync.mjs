/**
 * TruckTaxPro → Supabase sync. Run hourly (Task Scheduler on Windows, cron on Linux).
 *   1. UserMaster            → ttp_users
 *   2. FilingMaster (+2290)  → ttp_filings
 *   3. TaxPeriod             → ttp_tax_periods
 *   4. UserMaster            → TruckTaxEmailCenterDb.EmailMarketingCustomers (local MERGE)
 *   5. apply_customer_marks() in Supabase (leads → customers, exit sequences)
 * Incremental: only rows modified since the last successful run, plus a full pass on first run.
 */
import "dotenv/config";
import sql from "mssql";
import { createClient } from "@supabase/supabase-js";

const env = (k, d) => process.env[k] ?? d;
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const cfg = {
  server: env("MSSQL_SERVER", "localhost"), port: Number(env("MSSQL_PORT", 1433)),
  user: env("MSSQL_USER"), password: env("MSSQL_PASSWORD"),
  options: { encrypt: env("MSSQL_ENCRYPT", "false") === "true", trustServerCertificate: env("MSSQL_TRUST_CERT", "true") === "true" },
  requestTimeout: 120000,
};
const PROD = env("MSSQL_PROD_DB", "TruckTaxPro");
const EC = env("MSSQL_EMAILCENTER_DB", "TruckTaxEmailCenterDb");

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
async function upsert(table, rows, onConflict) {
  let n = 0;
  for (const part of chunk(rows, 500)) {
    const { error } = await sb.from(table).upsert(part, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    n += part.length;
  }
  return n;
}

async function main() {
  const { data: run } = await sb.from("sync_runs").insert({}).select().single();
  const log = (...a) => console.log(new Date().toISOString(), ...a);
  try {
    const { data: last } = await sb.from("sync_runs").select("started_at").is("error", null).not("finished_at", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle();
    const since = last ? new Date(new Date(last.started_at).getTime() - 2 * 3600 * 1000) : new Date("2000-01-01"); // 2h overlap for safety
    log("syncing changes since", since.toISOString());

    const pool = await sql.connect(cfg);

    // 1. Tax periods (tiny; always full)
    const tp = (await pool.request().query(`SELECT Id, TaxYear, StartDate, EndDate, IsActive FROM [${PROD}].dbo.TaxPeriod`)).recordset;
    await upsert("ttp_tax_periods", tp.map((r) => ({ id: r.Id, tax_year: r.TaxYear, start_date: r.StartDate, end_date: r.EndDate, is_active: !!r.IsActive })), "id");

    // 2. Users
    const users = (await pool.request().input("since", sql.DateTime2, since).query(`
      SELECT UserId, Name, EmailId, UserPhone, UserType, CreatedDate
      FROM [${PROD}].dbo.UserMaster
      WHERE EmailId IS NOT NULL AND ISNULL(IsDeleted,0) = 0 AND (CreatedDate >= @since OR ISNULL(ModifiedDate, CreatedDate) >= @since)`)).recordset;
    const usersUp = await upsert("ttp_users", users.map((r) => ({
      user_id: r.UserId, email: String(r.EmailId).trim().toLowerCase(), name: r.Name, phone: r.UserPhone, user_type: r.UserType,
      registered_at: r.CreatedDate, synced_at: new Date().toISOString(),
    })), "user_id");
    log("users upserted", usersUp);

    // 3. Filings joined to the 2290 return + status + period, with user email
    const filings = (await pool.request().input("since", sql.DateTime2, since).query(`
      SELECT f.FilingId, f.UserId, u.EmailId, f.FilingNumber, f.FilingStatusId, s.StatusName,
             r.TaxPeriodId, p.TaxYear, r.FirstUsedMonth, r.TotalVehicleCount,
             f.TotalTaxAmount, f.ServiceFeeAmount, f.TotalPayableAmount, f.CreatedDate, f.ModifiedDate
      FROM [${PROD}].dbo.FilingMaster f
      LEFT JOIN [${PROD}].dbo.UserMaster u ON u.UserId = f.UserId
      LEFT JOIN [${PROD}].dbo.Form2290ReturnMaster r ON r.FilingId = f.FilingId AND ISNULL(r.IsDeleted,0) = 0
      LEFT JOIN [${PROD}].dbo.TaxPeriod p ON p.Id = r.TaxPeriodId
      LEFT JOIN [${PROD}].dbo.FilingStatus s ON s.Id = f.FilingStatusId
      WHERE ISNULL(f.IsDeleted,0) = 0 AND ISNULL(f.ModifiedDate, f.CreatedDate) >= @since`)).recordset;
    const filingsUp = await upsert("ttp_filings", filings.map((r) => ({
      filing_id: r.FilingId, user_id: r.UserId, email: r.EmailId ? String(r.EmailId).trim().toLowerCase() : null, filing_number: r.FilingNumber,
      status_id: r.FilingStatusId, status: r.StatusName, tax_period_id: r.TaxPeriodId, tax_year: r.TaxYear, first_used_month: r.FirstUsedMonth,
      vehicle_count: r.TotalVehicleCount, total_tax: r.TotalTaxAmount, service_fee: r.ServiceFeeAmount, total_payable: r.TotalPayableAmount,
      created_at: r.CreatedDate, modified_at: r.ModifiedDate,
      completed_at: r.FilingStatusId === 4 ? (r.ModifiedDate ?? r.CreatedDate) : null,
      synced_at: new Date().toISOString(),
    })), "filing_id");
    log("filings upserted", filingsUp);

    // 4. Local merge: every registered user becomes an EmailMarketingCustomer (one SQL statement, no app roundtrip)
    const merge = await pool.request().query(`
      MERGE [${EC}].dbo.EmailMarketingCustomers AS t
      USING (SELECT DISTINCT LTRIM(RTRIM(EmailId)) AS EmailId FROM [${PROD}].dbo.UserMaster WHERE EmailId IS NOT NULL AND EmailId <> '' AND ISNULL(IsDeleted,0) = 0) AS s
        ON LOWER(t.EmailId) = LOWER(s.EmailId)
      WHEN NOT MATCHED THEN INSERT (EmailId) VALUES (s.EmailId);`);
    const merged = merge.rowsAffected?.[0] ?? 0;
    log("marketing customers merged", merged);

    // 5. Optional one-time: historical EmailMarketingCustomers → app leads
    if (env("IMPORT_HISTORICAL_CUSTOMERS", "false") === "true") {
      const hist = (await pool.request().query(`SELECT EmailId FROM [${EC}].dbo.EmailMarketingCustomers WHERE EmailId LIKE '%@%'`)).recordset;
      const rows = [...new Set(hist.map((r) => String(r.EmailId).trim().toLowerCase()))].map((email) => ({ email, source_file: "EmailMarketingCustomers (historical)", carrier_type: "Historical customer" }));
      const n = await upsert("leads", rows, "email");
      log("historical customers imported as leads", n);
    }

    // 6. Mark leads as customers + exit sequences
    const { data: marked, error: me } = await sb.rpc("apply_customer_marks");
    if (me) throw new Error(me.message);
    log("leads newly marked customer", marked);

    await sb.from("sync_runs").update({ finished_at: new Date().toISOString(), users_upserted: usersUp, filings_upserted: filingsUp, marketing_merged: merged }).eq("id", run.id);
    await pool.close();
    log("done");
  } catch (e) {
    console.error(e);
    await sb.from("sync_runs").update({ finished_at: new Date().toISOString(), error: String(e.message ?? e) }).eq("id", run.id);
    process.exit(1);
  }
}
main();
