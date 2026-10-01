# Sync (runs on the InterServer box)

Reads SQL Server locally and pushes to Supabase. Nothing inbound is opened on the server.

## Install (once)
1. Install Node.js 20 LTS on the server.
2. Copy this `sync/` folder to e.g. `C:\trucktaxpro-sync` (or `/opt/trucktaxpro-sync`).
3. `npm install`
4. Copy `.env.example` to `.env` and fill it in. Create a dedicated SQL login:
   ```sql
   CREATE LOGIN sync_user WITH PASSWORD = '<strong password>';
   USE TruckTaxPro;            CREATE USER sync_user FOR LOGIN sync_user; ALTER ROLE db_datareader ADD MEMBER sync_user;
   USE TruckTaxEmailCenterDb;  CREATE USER sync_user FOR LOGIN sync_user; ALTER ROLE db_datareader ADD MEMBER sync_user; ALTER ROLE db_datawriter ADD MEMBER sync_user;
   ```
5. First run by hand: `npm run sync`. With `IMPORT_HISTORICAL_CUSTOMERS=true` it also brings the 6,595 marketing customers into the app as leads. Then set it to `false`.

## Schedule
**Windows** — Task Scheduler → Create Task → Trigger: daily, repeat every 1 hour → Action: `node.exe` with argument `sync.mjs`, start in the sync folder.

**Linux** — `crontab -e`: `15 * * * * cd /opt/trucktaxpro-sync && node sync.mjs >> sync.log 2>&1`

Each run writes a row to `sync_runs` in Supabase; the app shows the last run time on the Dashboard.
