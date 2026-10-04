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
import { localPool } from "./sqlrunner.mjs";

const env = (k, d) => process.env[k] ?? d;
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const cfg = {
  server: env("MSSQL_SERVER", "localhost"),
  ...(env("MSSQL_SERVER", "localhost").includes("\\") ? {} : { port: Number(env("MSSQL_PORT", 1433)) }), // a named instance (host\\NAME) uses SQL Browser, not a port
  user: env("MSSQL_USER"), password: env("MSSQL_PASSWORD"),
  options: {
    encrypt: env("MSSQL_ENCRYPT", "false") === "true", trustServerCertificate: env("MSSQL_TRUST_CERT", "true") === "true",
    // Set MSSQL_TLS_LEGACY=true only if the server uses old TLS settings that current Node rejects.
    ...(env("MSSQL_TLS_LEGACY", "false") === "true" ? { cryptoCredentialsDetails: { minVersion: "TLSv1", ciphers: "DEFAULT@SECLEVEL=0" } } : {}),
  },
  requestTimeout: 120000,
  pool: { max: 2 },
};
const PROD = env("MSSQL_PROD_DB", "TruckTaxPro");
const EC = env("MSSQL_EMAILCENTER_DB", "TruckTaxEmailCenterDb");
// Be a polite client: never wait long on a lock, and if a deadlock ever happens, be the one that loses (not the website).
const GUARD = "SET DEADLOCK_PRIORITY LOW; SET LOCK_TIMEOUT 15000; ";

// MSSQL_MODE=local reads through shared memory (no TCP/IP needed). Default "tcp" uses the normal network connection.
const openPool = async () => (env("MSSQL_MODE", "tcp") === "local" ? localPool() : sql.connect(cfg));

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

    const pool = await openPool();

    // 1. Tax periods (tiny; always full)
    const tp = (await pool.request().query(GUARD + `SELECT Id, TaxYear, StartDate, EndDate, IsActive FROM [${PROD}].dbo.TaxPeriod`)).recordset;
    await upsert("ttp_tax_periods", tp.map((r) => ({ id: r.Id, tax_year: r.TaxYear, start_date: r.StartDate, end_date: r.EndDate, is_active: !!r.IsActive })), "id");

    // 2. Users
    const users = (await pool.request().input("since", sql.DateTime2, since).query(GUARD + `
      SELECT UserId, Name, EmailId, UserPhone, UserType, CreatedDate
      FROM [${PROD}].dbo.UserMaster
      WHERE EmailId IS NOT NULL AND ISNULL(IsDeleted,0) = 0 AND (CreatedDate >= @since OR ISNULL(ModifiedDate, CreatedDate) >= @since)`)).recordset;
    const usersUp = await upsert("ttp_users", users.map((r) => ({
      user_id: r.UserId, email: String(r.EmailId).trim().toLowerCase(), name: r.Name, phone: r.UserPhone, user_type: r.UserType,
      registered_at: r.CreatedDate, synced_at: new Date().toISOString(),
    })), "user_id");
    log("users upserted", usersUp);

    // 3. Filings joined to the 2290 return + status + period, with user email
    const filings = (await pool.request().input("since", sql.DateTime2, since).query(GUARD + `
      SELECT f.FilingId, f.UserId, u.EmailId, f.FilingNumber, f.FilingStatusId, s.StatusName,
             r.TaxPeriodId, p.TaxYear, r.FirstUsedMonth,
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
      total_tax: r.TotalTaxAmount, service_fee: r.ServiceFeeAmount, total_payable: r.TotalPayableAmount,
      created_at: r.CreatedDate, modified_at: r.ModifiedDate,
      completed_at: r.FilingStatusId === 4 ? (r.ModifiedDate ?? r.CreatedDate) : null,
      synced_at: new Date().toISOString(),
    })), "filing_id");
    log("filings upserted", filingsUp);

    // 3b. Vehicles per return, counted from the vehicle rows (production's TotalVehicleCount is not kept up to date).
    //     Recounted for every return on every run, because vehicle rows have no modified date.
    //     Reads only ids and the type code: never VIN, unit number, buyer or proof-file columns. Non-fatal, like the payments step.
    let vehiclesError = null;
    try {
      const typeIds = String(env("VEHICLE_TYPE_IDS", "1,2")).split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x > 0);
      const ids = (typeIds.length ? typeIds : [1, 2]).join(",");   // 1 = Taxable, 2 = Suspended. Credits (3 to 6) and prior-year (7) are not new trucks.
      const counts = (await pool.request().query(GUARD + `
        SELECT r.FilingId, COUNT(v.VehicleDetailId) AS VehicleCount
        FROM [${PROD}].dbo.Form2290ReturnMaster r
        JOIN [${PROD}].dbo.Form2290VehicleDetail v ON v.ReturnId = r.ReturnId
        WHERE ISNULL(r.IsDeleted,0) = 0 AND v.VehicleTypeId IN (${ids})
        GROUP BY r.FilingId`)).recordset;
      const { data: changed, error: ve } = await sb.rpc("apply_vehicle_counts", { p_counts: counts.map((c) => ({ filing_id: c.FilingId, n: Number(c.VehicleCount) })) });
      if (ve) throw new Error(ve.message);
      log("vehicle counts refreshed for", counts.length, "returns;", changed ?? 0, "changed");
    } catch (e) {
      vehiclesError = "Vehicles step: " + String(e.message ?? e) + " (run patch-009.sql in Supabase and grant sync_user SELECT on Form2290VehicleDetail (VehicleDetailId, ReturnId, VehicleTypeId))";
      console.error(vehiclesError);
    }

    // 4. Local insert: every registered user becomes an EmailMarketingCustomer (one SQL statement, no app roundtrip).
    //    If EmailMarketingCustomerId is not an IDENTITY column (e.g. the table came from an import), number the new rows ourselves.
    const isIdentity = (await pool.request().query(
      GUARD + `SELECT COLUMNPROPERTY(OBJECT_ID('[${EC}].dbo.EmailMarketingCustomers'), 'EmailMarketingCustomerId', 'IsIdentity') AS v`)).recordset[0]?.v === 1;
    const src = `SELECT DISTINCT LTRIM(RTRIM(EmailId)) AS EmailId FROM [${PROD}].dbo.UserMaster WHERE EmailId IS NOT NULL AND EmailId <> '' AND ISNULL(IsDeleted,0) = 0`;
    const notThere = `NOT EXISTS (SELECT 1 FROM [${EC}].dbo.EmailMarketingCustomers t WHERE LOWER(LTRIM(RTRIM(t.EmailId))) = LOWER(s.EmailId))`;
    const insertSql = isIdentity
      ? `INSERT INTO [${EC}].dbo.EmailMarketingCustomers (EmailId) SELECT s.EmailId FROM (${src}) s WHERE ${notThere}`
      : `INSERT INTO [${EC}].dbo.EmailMarketingCustomers (EmailMarketingCustomerId, EmailId)
         SELECT ISNULL((SELECT MAX(EmailMarketingCustomerId) FROM [${EC}].dbo.EmailMarketingCustomers), 0) + ROW_NUMBER() OVER (ORDER BY s.EmailId), s.EmailId
         FROM (${src}) s WHERE ${notThere}`;
    const merged = (await pool.request().query(GUARD + insertSql)).rowsAffected?.[0] ?? 0;
    log("marketing customers added", merged, isIdentity ? "(identity ids)" : "(ids assigned by sync)");

    // 5. Campaign audience: every EmailMarketingCustomers row becomes a lead. Only email and phone are kept.
    const aud = (await pool.request().query(GUARD + `
      SELECT LTRIM(RTRIM(c.EmailId)) AS EmailId, u.UserPhone, u.UserType
      FROM [${EC}].dbo.EmailMarketingCustomers c
      LEFT JOIN [${PROD}].dbo.UserMaster u ON LOWER(u.EmailId) = LOWER(LTRIM(RTRIM(c.EmailId))) AND ISNULL(u.IsDeleted,0) = 0
      WHERE c.EmailId LIKE '%@%'`)).recordset;

    // Addresses that unsubscribed, bounced or complained are never (re)added.
    const suppressed = new Set();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("suppressions").select("email").range(from, from + 999);
      if (error) throw new Error("suppressions: " + error.message);
      (data ?? []).forEach((r) => suppressed.add(r.email));
      if ((data?.length ?? 0) < 1000) break;
    }
    // Leads already in the app keep their list name; only their phone is refreshed.
    const existing = new Set();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("leads").select("email").range(from, from + 999);
      if (error) throw new Error("leads: " + error.message);
      (data ?? []).forEach((r) => existing.add(r.email));
      if ((data?.length ?? 0) < 1000) break;
    }

    const byEmail = new Map();
    for (const r of aud) {
      const email = String(r.EmailId).trim().toLowerCase();
      const prev = byEmail.get(email);
      if (!prev || (!prev.UserPhone && r.UserPhone)) byEmail.set(email, r);
    }
    const fresh = [], known = [];
    for (const [email, r] of byEmail) {
      if (suppressed.has(email)) continue;
      const phone = r.UserPhone ?? null;
      if (existing.has(email)) { if (phone) known.push({ email, phone }); }
      else fresh.push({ email, phone, carrier_type: r.UserType ? `Registered ${String(r.UserType).toLowerCase()}` : "Past customer", source_file: "EmailMarketingCustomers" });
    }
    const added = await upsert("leads", fresh, "email");
    const refreshed = await upsert("leads", known, "email");
    log("audience: new leads", added, "| phones refreshed", refreshed);

    // 6. Mark leads as customers + exit sequences
    const { data: marked, error: me } = await sb.rpc("apply_customer_marks");
    if (me) throw new Error(me.message);
    log("leads newly marked customer", marked);

    // 7. Service-fee payments (Stripe) and the coupon used. Safe columns only: never card, gateway or bank fields.
    //    Kept non-fatal so a problem here never blocks the steps above; it shows as "last sync failed" on the dashboard.
    let paymentsError = null;
    try {
      // First run of this step (nothing stored yet): read every payment, not only recent ones.
      const { count: havePayments, error: countErr } = await sb.from("ttp_payments").select("payment_id", { count: "exact", head: true });
      if (countErr) throw new Error(countErr.message);
      const paySince = (havePayments ?? 0) === 0 ? new Date("2000-01-01") : since;
      const pays = (await pool.request().input("since", sql.DateTime2, paySince).query(GUARD + `
        SELECT p.PortalFeePaymentId, p.FilingId, p.Amount, p.PaymentStatus, p.CreatedDate, p.ModifiedDate, p.IsDeleted,
               cu.DiscountAmount, cu.CouponCode
        FROM [${PROD}].dbo.PortalFeePayment p
        OUTER APPLY (SELECT SUM(u.DiscountAmount) AS DiscountAmount, MAX(c.CouponCode) AS CouponCode
                     FROM [${PROD}].dbo.FilingCouponUsage u
                     JOIN [${PROD}].dbo.CouponMaster c ON c.CouponId = u.CouponId
                     WHERE u.PortalFeePaymentId = p.PortalFeePaymentId) cu
        WHERE ISNULL(p.ModifiedDate, p.CreatedDate) >= @since`)).recordset;
      const payRows = pays.map((r) => ({
        payment_id: r.PortalFeePaymentId, filing_id: r.FilingId, amount: r.Amount ?? 0, payment_status: r.PaymentStatus,
        paid_on: r.CreatedDate, modified_at: r.ModifiedDate, is_deleted: !!r.IsDeleted,
        discount_amount: r.DiscountAmount ?? 0, coupon_code: r.CouponCode ?? null, synced_at: new Date().toISOString(),
      }));
      log("payments upserted", await upsert("ttp_payments", payRows, "payment_id"));
    } catch (e) {
      paymentsError = "Payments step: " + String(e.message ?? e) + " (run patch-007.sql in Supabase and grant sync_user the payment columns)";
      console.error(paymentsError);
    }

    await sb.from("sync_runs").update({ finished_at: new Date().toISOString(), users_upserted: usersUp, filings_upserted: filingsUp, marketing_merged: merged, error: [vehiclesError, paymentsError].filter(Boolean).join(" | ") || null }).eq("id", run.id);
    await pool.close();
    log("done");
  } catch (e) {
    console.error(e);
    await sb.from("sync_runs").update({ finished_at: new Date().toISOString(), error: String(e.message ?? e) }).eq("id", run.id);
    process.exit(1);
  }
}
/** node sync.mjs --check : prove the SQL connection and permissions work. Reads three counts, writes nothing anywhere. */
async function check() {
  const pool = await openPool();
  const r = await pool.request().query(GUARD + `SELECT SUSER_NAME() AS login_name,
      (SELECT COUNT(UserId) FROM [${PROD}].dbo.UserMaster) AS users,
      (SELECT COUNT(FilingId) FROM [${PROD}].dbo.FilingMaster) AS filings,
      (SELECT COUNT(EmailMarketingCustomerId) FROM [${EC}].dbo.EmailMarketingCustomers) AS audience`);
  console.log("Connected OK:", JSON.stringify(r.recordset[0]));
  await pool.close();
}

if (process.argv.includes("--check")) check().catch((e) => { console.error(e.message ?? e); process.exit(1); });
else main();
