// The KB: step-by-step guides shown inside the admin. Edit this file to change them.
// Inline `code` uses backticks. No secrets belong here: names of settings only, never values.

export type KbSection = { heading: string; text?: string; steps?: string[]; code?: string; note?: string };
export type KbArticle = { slug: string; group: string; title: string; summary: string; sections: KbSection[] };

export const KB_GROUPS = ["Start here", "Campaigns", "Dashboard and data", "Server and deployment", "Fix it"];

export const KB: KbArticle[] = [
  {
    slug: "overview", group: "Start here", title: "How everything fits together",
    summary: "The moving parts and what feeds what.",
    sections: [
      { heading: "The big picture", text: "This admin only reads copies of your production data. It never writes to the TruckTaxPro database. Everything it knows arrives through one daily sync." },
      { heading: "The parts", steps: [
        "Production (the InterServer server): SQL Server instance `localhost\\SQLEXPRESS` with the databases `TruckTaxPro` (users, filings, revenue) and `TruckTaxEmailCenterDb` (the contacts in `EmailMarketingCustomers`). `TrucktaxproDb` is not used.",
        "The daily sync (on that server, folder `C:\\trucktaxpro-sync`): runs at 6:00 AM server time, reads production and copies it to Supabase. It also adds new registrants to `EmailMarketingCustomers`.",
        "Supabase: the reporting copy (users, filings), the leads, the campaigns and the send history.",
        "This admin app (Vercel, trucktaxpro-filing.com): the dashboard and the campaign tools.",
        "Resend: sends the emails and reports delivered, opened, clicked and bounced back to this app.",
      ] },
      { heading: "Who receives campaign emails", text: "The audience is the contacts in `EmailMarketingCustomers`, loaded into the app as leads by the daily sync. Contacts who registered on trucktaxpro.com are marked as customers and skipped by prospect campaigns." },
      { heading: "How fresh is the data?", text: "The dashboard shows data as of the last sync, written under the page title. A new registration or filing appears the next morning." },
    ],
  },
  {
    slug: "send-in-3-steps", group: "Start here", title: "Send a campaign in 3 steps",
    summary: "The whole routine on one page.",
    sections: [
      { heading: "The routine", steps: [
        "Add leads. Leads, then Import a file for a new list. Your existing contacts arrive by themselves with the daily sync, so you usually skip this.",
        "Create the campaign. Campaigns, then New campaign. Choose who gets it, edit the emails, and use Send test to see each email in your own inbox.",
        "Send now or schedule. On the right, choose Send now, Schedule for later (pick a date and time), or Save as draft, then press the button and confirm.",
        "Watch the results on the campaign page: delivered, opened, clicked, bounced. People who file drop out automatically after the next daily sync.",
      ] },
      { heading: "Before the first real send", steps: [
        "Send a test of every email to yourself and check the inbox and spam folder. You can send the whole sequence to up to 5 addresses at once.",
        "Click the unsubscribe link in a test to confirm it works (see the guide on unsubscribes to undo it).",
        "Set a low Emails per day. See Warm up the sending domain.",
      ] },
      { note: "Emails only go out on weekdays between 9 AM and 5 PM Central, whatever time you schedule." , heading: "Remember" },
    ],
  },
  {
    slug: "import-leads", group: "Campaigns", title: "Import leads from a file",
    summary: "Add contacts from an Excel or CSV file.",
    sections: [
      { heading: "Steps", steps: [
        "Leads, then Import a file.",
        "Drag the file onto the box or choose it. .xlsx and .csv both work.",
        "Check the preview. The line Columns found should include the email column.",
        "Type a List name, for example Past customers. You pick this name in a campaign to choose who gets it.",
        "Click Import these leads. A bar shows progress; files upload 500 rows at a time.",
        "Read the Result panel: new leads, already on file (refreshed), skipped (suppressed).",
      ] },
      { heading: "What is kept", text: "Only the email and the phone number, plus the list name. The column names `Contact Email`, `Email` or `EMAIL_ADDRESS` are recognized for the email, and `Phone Number`, `Phone` or `TELEPHONE` for the phone. Everything else in the file is ignored." },
      { heading: "Good to know", steps: [
        "Re-importing is safe. Contacts are matched by email, so they are updated, never duplicated, and keep their status. The list name is replaced by the one you type.",
        "Addresses that unsubscribed, bounced or complained are skipped.",
        "Your existing customers do not need importing. The daily sync loads them as the list Past customer.",
        "For very large files, import in parts. The file is read in your browser.",
      ] },
    ],
  },
  {
    slug: "create-campaign", group: "Campaigns", title: "Create a campaign",
    summary: "Audience, emails, pace and timing.",
    sections: [
      { heading: "Steps", steps: [
        "Campaigns, then New campaign. Give it a name.",
        "1. Who gets it. Click lists to narrow it, or leave them unselected for everyone. Use Only the first to roll out in batches.",
        "2. What you send. Start from a template (2290 filing due date, Prefile 2290 starts now, We accept 2290 for TY2027-28, or Blank). Edit any word, or type a title and press Write with AI. Use Preview this email to see the finished email.",
        "Send yourself a test of each email, or all of them at once.",
        "3. When to send. Choose Send now, Schedule for later or Save as draft. Set Emails per day.",
        "Press the button at the bottom right. For Send now and Schedule you are asked to confirm the numbers.",
      ] },
      { heading: "Writing the emails", text: "Contacts only have an email address and sometimes a phone number, so emails open with Hi there and do not use names or other details. A blank line starts a new paragraph, a line with only a link becomes an orange button, and **bold** works. See Templates, the AI writer and email design." },
      { heading: "Who leaves a campaign", steps: [
        "Anyone who unsubscribes, bounces or complains, immediately.",
        "Prospect campaigns: a contact who registers on trucktaxpro.com (after the next daily sync).",
        "Renewal campaigns: a customer who pays for a return for the target tax year.",
      ] },
      { heading: "Rules", note: "A contact can be in only one campaign at a time, and only contacts with status new are enrolled." },
    ],
  },
  {
    slug: "test-email", group: "Campaigns", title: "Send a test email",
    summary: "See exactly what a contact will receive.",
    sections: [
      { heading: "Two places", steps: [
        "While building: type your address in Test address under 2. What you send, then press Send test on any email.",
        "On a saved campaign: scroll to the bottom of the Sequence box, choose the email, type your address and press Send test.",
      ] },
      { heading: "What to check", steps: [
        "It arrives, and in the inbox rather than spam.",
        "It reads well on a phone and the links open trucktaxpro.com.",
        "The unsubscribe link works.",
        "Replying lands in the reply-to mailbox.",
      ] },
      { heading: "Good to know", note: "Tests use sample values for the placeholders and the subject starts with [TEST]. They enroll nobody, are not counted in the campaign numbers, and work any day and hour. Clicking Unsubscribe in a test adds that address to the suppression list." },
    ],
  },
  {
    slug: "schedule-and-rules", group: "Campaigns", title: "Send now, schedule, and the sending rules",
    summary: "When emails really go out.",
    sections: [
      { heading: "Three choices", steps: [
        "Send now: the campaign starts at the next sending opening.",
        "Schedule for later: pick a date and time in your computer's time zone. The page shows the same moment in Central time.",
        "Save as draft: nothing sends until you press Start now or Schedule on the campaign page.",
      ] },
      { heading: "The sending rules", steps: [
        "Emails go out on weekdays between 9 AM and 5 PM Central only. A time outside that starts at the next opening.",
        "A check runs every 15 minutes. Each run sends a slice of the daily limit, so sending spreads across the day.",
        "Three limits apply: Emails per day on the campaign, plus the daily and monthly limits in Settings. The daily limit is 700, or 1,000 in May, June and July. The monthly limit is 50,000.",
        "Follow-ups wait the set number of days, then go out at the next opening.",
      ] },
      { heading: "Controls on a campaign page", steps: [
        "Start now, Schedule or Reschedule, Cancel schedule (back to draft).",
        "Pause and Resume.",
        "End stops the campaign for good. Remaining emails are not sent.",
      ] },
      { heading: "Time zones", note: "Central is 10.5 hours behind Chennai while daylight saving lasts, so 9 AM Central is 7:30 PM in Chennai. After the clocks change on 1 November it is 11.5 hours, so 9 AM Central is 8:30 PM in Chennai." },
    ],
  },
  {
    slug: "sending-limits", group: "Campaigns", title: "How sending works and the limits",
    summary: "The queue, the daily limits and Resend's limits.",
    sections: [
      { heading: "Sending is a queue, not a blast", text: "Pressing Start sending never sends anything by itself. It enrolls the contacts. A worker then runs every 15 minutes on weekdays during the sending hours and sends a small slice (about 22 emails at 700 a day) in one Resend batch request, which can carry up to 100 emails. If a send fails, those emails stay due and are retried on the next run." },
      { heading: "Our limits", steps: [
        "700 emails a day, all campaigns together. In May, June and July the limit is 1,000 a day. Both are in Settings.",
        "50,000 emails a month, which matches the Resend plan. On a paid plan Resend bills extra emails rather than blocking them, but the app stops at the monthly number in Settings.",
        "Each campaign also has its own Emails per day. It can only lower the daily limit, never raise it.",
      ] },
      { heading: "Resend's own limits", steps: [
        "Resend limits API requests per second for the whole account. The default has been between 2 and 10 a second depending on the account, and Settings, then Usage, in Resend shows yours. It does not limit emails per minute.",
        "One batch request carries up to 100 emails and counts as a single request, so the app stays far below the limit.",
        "If Resend answers that the account is rate limited, the app waits and retries, and otherwise tries again on the next 15-minute run.",
        "A send that Resend did not accept is never counted as sent and never uses up the daily limit.",
      ] },
      { heading: "Test emails", text: "Test emails go straight out in one batch request, any day and hour. They are not part of the queue and do not count toward the daily limit." },
    ],
  },
  {
    slug: "tracking", group: "Campaigns", title: "Opens, clicks and tracking",
    summary: "Why the numbers can be zero, and how to turn tracking on.",
    sections: [
      { heading: "What comes from where", steps: [
        "Delivered, bounced and spam complaints come from Resend through the webhook.",
        "Opened and Clicked also come through the webhook, but Resend only records them when tracking is switched on for the sending domain. It is off by default.",
        "Test emails are not counted in the campaign numbers. The Recent test emails table on a campaign page shows what Resend reported for them.",
      ] },
      { heading: "Turn tracking on", steps: [
        "In Resend, open Domains and click your sending domain.",
        "In the Configuration tab, find Enable tracking metrics and click Configure.",
        "Give the tracking subdomain a name, tick Click tracking and Open tracking, and add it.",
        "Add the DNS record Resend shows, wherever the domain's DNS is managed, then press the button to verify.",
      ], note: "Using your own tracking subdomain keeps link and image addresses on your domain instead of a shared one, which is better for deliverability." },
      { heading: "Check that it works", steps: [
        "Send a test of the whole sequence to your own address from any campaign page.",
        "Open one email and click a link in it.",
        "Within about a minute the Recent test emails table shows times under Delivered, Opened and Clicked.",
      ] },
      { heading: "If Delivered stays empty", text: "The webhook is not reaching the app. In Resend, Webhooks, the endpoint must be `https://trucktaxpro-filing.com/api/webhooks/resend`, with all email events ticked and its signing secret saved as `RESEND_WEBHOOK_SECRET` in Vercel. To see whether anything has arrived, run this in the Supabase SQL editor.", code: "select type, count(*), max(received_at) from email_events group by type order by max(received_at) desc;" },
      { heading: "Reading the numbers", note: "Treat opens as a rough guide. Some mail apps block or pre-load images, so opens can be missed or inflated. Clicks are more reliable, and customers who go on to file are the number that matters most." },
    ],
  },
  {
    slug: "templates-and-ai", group: "Campaigns", title: "Templates, the AI writer and email design",
    summary: "Starter emails, writing with AI, and how every email looks.",
    sections: [
      { heading: "Templates", steps: [
        "In New campaign, section 2, open Start from a template.",
        "Choose 2290 filing due date, Prefile 2290 starts now, We accept 2290 for TY2027-28, or Blank.",
        "The emails fill in. Change any word, add or remove follow-ups, and change the days between them.",
      ], note: "Check the dates and claims before you send. For example, only use Prefile 2290 starts now once prefiling has really opened." },
      { heading: "Write with AI", steps: [
        "Type a Title in the email. It is also the subject line.",
        "Optional: add Details for the AI, such as a deadline or an offer.",
        "Press Write with AI. The text appears in the body.",
        "Read it, edit it however you like, press Preview this email, then send yourself a test.",
      ], note: "The AI is told to use only basic Form 2290 facts and never to invent prices, dates or turnaround times. You are still responsible for what is sent, so always read it first." },
      { heading: "What the AI needs", text: "A key in Vercel named `ANTHROPIC_API_KEY`, created at console.anthropic.com, with credit on that account. It uses a small, low-cost model, so each draft costs very little. If it shows an error, the message names the reason." },
      { heading: "How every email looks", text: "A navy header with the TruckTaxPro logo and an orange line, your text, and a dark footer with the phone number, social icons, the tagline, the postal address and the unsubscribe link. A paragraph that is only a link becomes an orange button." },
      { heading: "Footer settings (in Vercel)", steps: [
        "`COMPANY_POSTAL_ADDRESS`: required in every marketing email. Sending pauses until it is set.",
        "`SOCIAL_X_URL`, `SOCIAL_INSTAGRAM_URL`, `SOCIAL_FACEBOOK_URL`: each icon appears only when its link is set.",
        "`COMPANY_PHONE` (optional): defaults to +1-972-810-3393.",
        "`EMAIL_FOOTER_REASON` (optional): the line saying why they receive the email.",
      ] },
      { heading: "Logo and icons", text: "They live in the project folder `public/brand` as `logo.png`, `x.png`, `instagram.png` and `facebook.png`. Replace a file with one of the same name to change it, then push." },
    ],
  },
  {
    slug: "retention", group: "Dashboard and data", title: "Retention: who comes back",
    summary: "Who filed in a month, and whether they have filed again.",
    sections: [
      { heading: "What it shows", text: "Pick a tax year and a month. The list shows the customers who paid for a return then, and whether they have paid again in the following tax year. For example: filed in April 2027 (TY2026-27), and filed again in TY2027-28." },
      { heading: "How to read it", steps: [
        "The four cards: how many filed, how many filed again, how many have not yet, and how many of those are already in a follow-up sequence.",
        "The By month table: click a month to see only the customers who filed in that month. All months counts each customer once.",
        "The customer list: Yes with a date means they filed again, and Not yet means they have not. Follow-up shows whether they are in a sequence, unsubscribed or not contacted. Source says System or Imported.",
      ] },
      { heading: "What you can do", steps: [
        "Download CSV: the customers in the selected group, ready for Excel.",
        "Start renewal campaign: creates a draft for the customers who have not filed again. Review it, test it, then start it.",
        "Import past filers: add customers who filed with you but are not in the system. See below.",
      ] },
      { heading: "Import past filers", steps: [
        "Prepare an Excel or CSV file with an Email column and a Filed On column. Filed On can be a date, or just a month such as 2027-04.",
        "Retention, then Import past filers, then Choose file, then Import these filings.",
        "They join the group for the month they filed, and show as Imported. They do not affect revenue.",
      ] },
      { heading: "Which years appear", text: "Retention starts at TY2026-27, the first season on this platform. A group is compared with the following tax year, so TY2026-27 filers are compared with TY2027-28. The numbers fill in as customers file next season." },
      { heading: "How due dates fit", note: "Form 2290 is an annual return. For vehicles already on the road, the next return is usually due for the new tax period that starts on 1 July, so a customer who filed in April may file again in July or August rather than April. Filed again looks at the whole next tax year, so it is accurate either way." },
    ],
  },
  {
    slug: "monthly-renewals", group: "Campaigns", title: "Monthly renewals (automatic)",
    summary: "A renewal campaign created for you every month.",
    sections: [
      { heading: "What it does", text: "Once a month it takes the customers who filed in this same month last year (for example everyone who filed in April 2027, when it is April 2028), removes anyone who has already filed in the current tax year, and creates a renewal campaign for the rest. It is separate from your general campaigns." },
      { heading: "Set it up", steps: [
        "Dashboard, then Retention, then scroll to Monthly renewals.",
        "Tick Create it every month, and choose the day of the month (1 is the default).",
        "Choose Review first (recommended) or Send automatically.",
        "Edit the two emails. Press Write with AI if you like, then read and change the text.",
        "Press Save settings.",
      ] },
      { heading: "Review first or automatic", steps: [
        "Review first: each month a draft appears under Ready to review on the Retention page. You open it, check it, send yourself a test and press Start now.",
        "Send automatically: the campaign starts by itself, within the usual weekday sending hours and daily limits. Use this only once you are happy with the emails.",
      ] },
      { heading: "Try it", text: "Press Create this month's renewals now to see exactly what the monthly job would create. Only one is created per month, so a manual run uses up that month's automatic one." },
      { heading: "Placeholders in the emails", text: "`{{last_filed}}` becomes the month they filed, for example April 2027. `{{tax_year}}` becomes the year they should file in, for example 2027-28. `{{month}}` becomes the current month name." },
      { heading: "Good to know", steps: [
        "A daily check runs automatically and only acts once a month, on the day you chose.",
        "If nobody qualifies, nothing is created, and Last run explains why.",
        "Unsubscribed, bounced and complained addresses are never included.",
        "Because this platform started in September 2026, the first month with customers to remind is in 2027.",
        "It needs `patch-008.sql` in Supabase.",
      ] },
    ],
  },
  {
    slug: "warm-up", group: "Campaigns", title: "Warm up the sending domain",
    summary: "How to ramp up without landing in spam.",
    sections: [
      { heading: "Why", text: "A new sending domain has no reputation. Sending a lot at once makes inbox providers treat it as spam, and that is hard to undo." },
      { heading: "The ramp", steps: [
        "Week 1: 50 emails a day.",
        "Week 2: 100 a day.",
        "Week 3: 200 a day.",
        "Week 4: 400 a day.",
        "Week 5 onward: up to 700 a day, only if the earlier weeks were healthy. 700 is the ceiling all year. Only May, June and July allow 1,000, set in Settings.",
      ] },
      { heading: "How to change the pace", steps: [
        "Open the campaign and change Emails per day in the box under the title, then Save limit.",
        "Make sure the daily limit in Settings is at least as high.",
        "Change it once a week, not daily.",
      ] },
      { heading: "Health checks", steps: [
        "In Resend, keep bounces under 2% and complaints under 0.1%. If either goes higher, pause the campaign and tell us.",
        "In Resend, Domains must show Verified. Add a DMARC record at the domain's DNS.",
        "Never send to addresses that bounced or unsubscribed. The app already skips them.",
      ] },
      { heading: "Batches", note: "Use Only the first when creating a campaign to roll out to a part of the audience, then make the next campaign for the rest." },
    ],
  },
  {
    slug: "renewals", group: "Campaigns", title: "Renewal campaigns for returning customers",
    summary: "Email the customers who filed before but have not filed again.",
    sections: [
      { heading: "Steps", steps: [
        "Dashboard, then Retention. Choose the tax year, then click a month (or All months).",
        "The list shows who filed then, and whether they have filed again in the next tax year.",
        "Press Start renewal campaign. It creates a draft for the customers who have not filed again, skipping anyone already in a sequence or unsubscribed.",
        "Open the campaign, send yourself a test, then press Start now or Schedule.",
      ] },
      { heading: "How people drop out", text: "A customer leaves the campaign as soon as they pay for a return in the next tax year. This is checked before every email and at each daily sync." },
      { heading: "Every month, automatically", text: "See Monthly renewals (automatic) to have this created for you each month." },
      { heading: "Good to know", note: "This depends on filing history in production. Customers who filed before this platform existed can be added with Import past filers on the Retention page." },
    ],
  },
  {
    slug: "dashboard-numbers", group: "Dashboard and data", title: "What the dashboard numbers mean",
    summary: "Definitions, so everyone reads them the same way.",
    sections: [
      { heading: "Definitions", steps: [
        "Paid return: a filing that has been paid, meaning its status is Paid, Submitted, Completed or Schedule 1 Ready. A draft or rejected return does not count.",
        "Month of a return: the month it was paid, taken from the filing's last update date.",
        "Revenue: what Stripe actually collected for TruckTaxPro's service fee, after any discount, in the month it was paid (`PortalFeePayment`). It is not the list price and not the IRS tax. The Filings & revenue page also shows list price, discounts given and the coupons used.",
        "Paying customers: people with at least one paid return.",
        "Tax years shown: from TY2026-27, the first season on this platform, up to the next season. The next season appears by itself, so TY2027-28 shows now and TY2028-29 appears on 1 July 2027. Earlier years are not shown because there is no data.",
        "Tax year: TY2026-27 means the tax period 1 July 2026 to 30 June 2027. The year shown is the active period.",
        "Registrations: users by the date they signed up (`UserMaster.CreatedDate`). Deleted users are left out.",
        "Became customers: contacts from your lists whose email now exists as a registered user.",
      ] },
      { heading: "Freshness", text: "Numbers are as of the last daily sync, shown under the page title. If it says the last sync failed, see the sync guide." },
      { heading: "Comparing years", text: "Charts show the active tax year beside the previous one, month by month, July to June." },
    ],
  },
  {
    slug: "sync-server", group: "Server and deployment", title: "The daily sync on the server",
    summary: "What it does, how to run it, and how to read the result.",
    sections: [
      { heading: "What it does", text: "Reads production on the server and copies users, filings and the contact list to Supabase. It adds new registrants to `EmailMarketingCustomers`. It never writes to the `TruckTaxPro` database." },
      { heading: "Where and when", steps: [
        "Folder `C:\\trucktaxpro-sync` on the server.",
        "Windows Task Scheduler task `TruckTaxPro Sync`, daily at 6:00 AM server time, running as SYSTEM.",
        "The server's own backups run at 2:00 AM, so they never overlap.",
      ] },
      { heading: "Run it or check it by hand", code: String.raw`cd C:\trucktaxpro-sync
node sync.mjs --check        (read-only: proves the connection works)
npm run sync                 (runs a full sync now)
Start-ScheduledTask -TaskName "TruckTaxPro Sync"
Get-ScheduledTaskInfo -TaskName "TruckTaxPro Sync" | Select LastRunTime, LastTaskResult, NextRunTime` },
      { heading: "Reading the task result", steps: [
        "0: it worked.",
        "267009: it is still running. Wait a minute and check again.",
        "2147942402 (0x80070002): Windows could not start the program. The path to node needs quotes. Run the fix below.",
        "1: the sync started and failed. Run `node sync.mjs` by hand to see the message.",
      ] },
      { heading: "Fix for 0x80070002", code: String.raw`$node = '"' + (Get-Command node).Source + '"'
$a = New-ScheduledTaskAction -Execute $node -Argument "sync.mjs" -WorkingDirectory "C:\trucktaxpro-sync"
Set-ScheduledTask -TaskName "TruckTaxPro Sync" -Action $a` },
      { heading: "Settings in the sync's .env file (names only)", text: "`MSSQL_SERVER` (`localhost\\SQLEXPRESS`), `MSSQL_MODE` (`local`), `MSSQL_USER` (`sync_user`), `MSSQL_PASSWORD`, `MSSQL_PROD_DB`, `MSSQL_EMAILCENTER_DB`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Never paste the values into chats or tickets. The folder is locked to SYSTEM and Administrators." },
      { heading: "Why it uses local mode", text: "TCP/IP is switched off on this SQL Server. The only network listener (port 49679) is SQL Server's admin-only connection, which refuses normal logins. So the sync reads through shared memory with Windows PowerShell (`sqlquery.ps1`), the same route SSMS uses on the server.", note: "Do not turn on TCP/IP or restart SQL Server for this, and never give `sync_user` sysadmin rights." },
      { heading: "What the login can do", text: "`sync_user` can read eight tables in `TruckTaxPro`, and only safe columns of them: never passwords, card details, payment gateway data or bank details. It can also read and add rows in `EmailMarketingCustomers`. Nothing else. The sync keeps only each contact's email and phone." },
    ],
  },
  {
    slug: "deploy-changes", group: "Server and deployment", title: "Deploy a change",
    summary: "From a zip file to the live site.",
    sections: [
      { heading: "Steps", steps: [
        "Extract the zip into the project folder `C:\\Users\\chan2\\DASHBOARD\\trucktaxpro-admin\\trucktaxpro-campaigns` and choose Replace when asked.",
        "If the update includes a new SQL file in the `supabase` folder, run it in the Supabase SQL editor first (copy the whole file, paste, Run).",
        "Push the change with the commands below.",
        "In Vercel, open Deployments and wait until the newest one says Ready. If it says Error, open it and read the message.",
        "Reload the site with Ctrl+F5.",
      ] },
      { heading: "Commands", code: String.raw`git add .
git commit -m "Describe the change"
git push` },
      { heading: "Good to know", steps: [
        "SQL files so far, in order: `patch-002` (audiences and counts), `003` (scheduling), `004` (daily limits), `005` (test email tracking), `006` (paid returns), `007` (payments and revenue), `008` (retention and monthly renewals). Each is safe to run again.",
        "The sync scripts live on the server in `C:\\trucktaxpro-sync`, not in Vercel. Updating them means copying files there.",
      ] },
    ],
  },
  {
    slug: "environment", group: "Server and deployment", title: "Settings (environment variables)",
    summary: "What each Vercel setting is for. Names only.",
    sections: [
      { heading: "Where", text: "Vercel, then the project, Settings, Environment Variables. After changing one, redeploy. Settings starting with `NEXT_PUBLIC_` are fixed at build time, so they need a redeploy." },
      { heading: "The list", steps: [
        "`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: the Supabase project. The service role key is private.",
        "`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`: sending and the delivery-event webhook.",
        "`EMAIL_FROM`, `EMAIL_REPLY_TO`: who the email is from and where replies go.",
        "`NEXT_PUBLIC_APP_URL`: this site's address. Unsubscribe links are built from it.",
        "`ADMIN_EMAILS`: the only addresses allowed to sign in.",
        "`CRON_SECRET`: protects the 15-minute sender. `UNSUBSCRIBE_SECRET`: signs unsubscribe links.",
        "`COMPANY_POSTAL_ADDRESS`: printed in every email footer (required by law).",
        "`EMAIL_FOOTER_REASON` (optional): the line explaining why they receive the email.",
        "`ANTHROPIC_API_KEY`: powers Write with AI.",
        "`SOCIAL_X_URL`, `SOCIAL_INSTAGRAM_URL`, `SOCIAL_FACEBOOK_URL`, `COMPANY_PHONE`: the email footer.",
        "`FIRST_TAX_YEAR` (optional): the first tax year the dashboard shows. The default is 2026.",
      ] },
    ],
  },
  {
    slug: "unsubscribes", group: "Campaigns", title: "Unsubscribes, bounces and the suppression list",
    summary: "Who is never emailed, and how to undo it for a test address.",
    sections: [
      { heading: "How it works", steps: [
        "Every email has an unsubscribe link and a one-click header. Using either adds the address to the suppression list.",
        "Bounces and spam complaints reported by Resend are added automatically.",
        "Imports skip suppressed addresses, and the sender never emails them.",
      ] },
      { heading: "Remove a test address", steps: [
        "Supabase, then Table Editor, then `suppressions`. Delete the row for that address.",
        "Run the SQL below to make the contact eligible again.",
      ], code: "update leads set status = 'new', updated_at = now() where email = 'test@example.com';" },
      { heading: "Be careful", note: "Only restore addresses that asked to come back, such as your own tests. Emailing someone who unsubscribed breaks the law (CAN-SPAM) and damages deliverability." },
    ],
  },
  {
    slug: "troubleshooting", group: "Fix it", title: "Troubleshooting",
    summary: "The usual problems and where to look.",
    sections: [
      { heading: "I cannot sign in", steps: [
        "The login page now says why. \"Did not accept the session\": the Supabase URL or anon key in Vercel is from a different project than the admin user. Fix them and redeploy.",
        "\"Not listed in ADMIN_EMAILS\": correct that setting exactly and redeploy.",
        "Wrong password: Supabase, Authentication, Users, reset it.",
        "Try a private window to rule out an old cookie.",
      ] },
      { heading: "A campaign is running but nothing is sending", steps: [
        "Is it a weekday between 9 AM and 5 PM Central? Outside that nothing goes out.",
        "Is the status running? Scheduled, paused and draft campaigns do not send.",
        "Does the campaign show contacts still active?",
        "Is `COMPANY_POSTAL_ADDRESS` set in Vercel? Without it sending is paused and the sender says so.",
        "Check the three limits: Emails per day on the campaign, and the daily and monthly limits in Settings.",
        "Send yourself a test. If it fails, the message names the Resend problem (domain not verified, bad key).",
        "Run the sender by hand and read its answer with the command below.",
      ], code: String.raw`curl.exe -H "Authorization: Bearer <CRON_SECRET>" https://trucktaxpro-filing.com/api/cron/dispatch`, note: "The answer is {\"sent\":{...}} when emails went out, or {\"skipped\":\"weekend\"} or {\"skipped\":\"cap reached\"} with the reason." },
      { heading: "Delivered, opened and clicked stay at zero", steps: [
        "In Resend, Webhooks, the endpoint must be `https://trucktaxpro-filing.com/api/webhooks/resend` with all email events ticked.",
        "Its signing secret must match `RESEND_WEBHOOK_SECRET` in Vercel.",
        "Resend shows recent deliveries to that endpoint. Failures show the reason.",
        "Opened and Clicked also need tracking switched on for the domain in Resend. See Opens, clicks and tracking.",
        "Test emails are not counted here. Look at the Recent test emails table on the campaign page.",
      ] },
      { heading: "The dashboard says waiting for the first sync, or last sync failed", text: "See The daily sync on the server. Run `node sync.mjs --check` by hand and read the message." },
      { heading: "Write with AI shows an error", text: "The message names the reason. Usually `ANTHROPIC_API_KEY` is missing in Vercel, or the Anthropic account has no credit." },
      { heading: "Emails land in spam", text: "Follow Warm up the sending domain, confirm the domain is Verified in Resend, add a DMARC record, and keep the daily number low until the results are clean." },
      { heading: "Filings or Retention look empty", text: "Production only holds filings since the new platform went live. Older history is not in the database the sync reads, so these pages fill up as new filings arrive." },
    ],
  },
];

export const kbBySlug = (slug: string) => KB.find((a) => a.slug === slug);
