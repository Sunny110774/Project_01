# Synopse

Synopse is an email-driven incident operations workspace for triaging alerts from multiple locations. It organizes incidents by P1-P4 priority, tracks response SLAs, retains original email payloads, and brings operational knowledge into an AI-assisted search experience.

## Included

- Responsive operations dashboard with a realistic sample queue, priority filters, search, alert detail, assignment/resolve controls, and manual alert intake.
- Daily dashboard shows every alert created on the current Eastern date, regardless of status, until 5:00 PM America/New_York. At/after cutoff, today's dashboard closes; unresolved alerts move into Backlog. Unresolved alerts from earlier dates are always in Backlog, and older resolved alerts are excluded.
- PostgreSQL/Prisma schema for alerts, raw email, SLA targets, assignment, lifecycle timestamps, activity history, and connected knowledge documents.
- Authenticated inbound email endpoint at `POST /api/alerts/intake`.
- Server-side assistant endpoint for OpenAI ChatGPT and Anthropic Claude, with context from PostgreSQL and optional SharePoint, Jira, and Confluence search.
- GitHub Actions verification and a Vercel deployment path: merge `main` to `uat`, verify/deploy UAT, then manually promote the tested `uat` branch to production.
- Functional workflow, architecture rationale, project skills, alternatives, and glossary: [Project guide](docs/PROJECT_GUIDE.md).

The dashboard loads alerts from PostgreSQL and refreshes the queue every 30 seconds. If the database is not configured, it falls back to in-memory sample alerts; sample-mode interactions are not persisted. Email intake and AI requests use server APIs and require the configuration below.

Production requires `SYNOPSE_ACCESS_USER` and `SYNOPSE_ACCESS_PASSWORD`; the app uses an HTTPS Basic Auth gate. The inbound email endpoint is excluded from that gate and uses its own bearer secret. This is a starter access boundary for a small trusted workspace, not per-user identity or SSO; adopt your organization's identity provider before broad rollout.

MFA codes are delivered only through the selected channel. Email requires a Resend API key and a verified sender configured with `RESEND_API_KEY` and `MFA_EMAIL_FROM`. Mobile delivery requires Twilio credentials and either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER`. Keep these values in `.env` or deployment secrets; they are never exposed to the browser. Codes expire after 10 minutes and are stored hashed.

Manual alert intake can email multiple department addresses through Resend. Configure `ALERT_EMAIL_FROM` (or reuse `MFA_EMAIL_FROM`) with `RESEND_API_KEY`; recipients are recorded with the alert and delivery outcomes appear in the operations log. Configure `SERVICENOW_INSTANCE_URL` and either `SERVICENOW_ACCESS_TOKEN` or `SERVICENOW_USERNAME` plus `SERVICENOW_PASSWORD` to create and synchronize incidents. ServiceNow user display names must match the Synopse assignee exactly and uniquely. Jira and Confluence access is search-only; the integration uses read requests and does not expose update operations.

The **Logs** control shows recent persisted alert activity, email delivery, ServiceNow synchronization, and scheduled closure outcomes. The hourly generator can also be run manually from the dashboard.

The `Generate hourly dummy alert` GitHub Actions workflow calls `GET /api/alerts/generate` once per hour and creates one alert per run. Add `SYNOPSE_BASE_URL` (the deployed app's base URL) and `CRON_SECRET` as GitHub Actions repository secrets, and set the same `CRON_SECRET` in the deployed app's environment. The endpoint and middleware require its bearer token in production. GitHub scheduled jobs may be delayed during high load; use a Vercel Pro cron or another external scheduler if tighter timing is required. In local development, the running Next.js server also creates one alert per hour; the timer starts when the server starts. The workflow can also be run manually from the Actions tab; local manual generation remains available through the dashboard button.

## Local setup

Requirements: Node.js 20.9 or later, npm, and PostgreSQL.

1. Copy `.env.example` to `.env` and set `DATABASE_URL` and `INBOUND_EMAIL_WEBHOOK_SECRET`.
2. Install packages, generate the Prisma client, apply migrations, and seed the dashboard demo alerts:

   ```powershell
   npm.cmd install
   npx.cmd prisma generate
   npm.cmd run db:migrate
   npm.cmd run db:seed
   ```

3. Start the development server:

   ```powershell
   npm.cmd run dev
   ```

4. Open `http://localhost:3000`.

The checked-in SQL migrations are used by `npm run db:deploy` in UAT and production. Use `npm run db:push` only for disposable local databases where migration history is not needed.

`npm run db:seed` loads eight representative mock alerts from the shared `prisma/demo-alerts.json` fixture. It is safe to rerun and does not duplicate existing demo alerts. On Windows PowerShell, use the `.cmd` command wrappers if script execution blocks `npm` or `npx`.

## PowerShell quick reference

Use these in Windows PowerShell when working from the project root:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
Set-Location "d:\Naveen\Learning and job hunt\ai.prototype\Synapse-System Resilience Hub"

npm.cmd install
npm.cmd run dev
start http://localhost:3000

npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build

npx.cmd prisma generate
npm.cmd run db:migrate
npm.cmd run db:seed
npx.cmd prisma studio

# Optional local reset
npx.cmd prisma db push
```

## Email intake

Configure your email provider to forward parsed mail to `POST /api/alerts/intake` with a bearer token matching `INBOUND_EMAIL_WEBHOOK_SECRET`. Requests are limited to 1 MB and require `from`, `subject`, `text`, and `rawEmail`; `to`, `html`, `messageId`, and `location` are optional. The raw MIME/original message is stored for auditability. Duplicate message IDs are rejected. Initial P1-P4 classification is keyword-based; tune the rules in `src/app/api/alerts/intake/route.ts` to match your incident policy before production use.

Example body:

```json
{
  "from": "noc@example.com",
  "to": "alerts@example.com",
  "subject": "Critical: payment service unavailable",
  "text": "Checkout requests are failing in the EU region.",
  "html": "<p>Checkout requests are failing in the EU region.</p>",
  "rawEmail": "From: noc@example.com\\r\\nSubject: Critical: payment service unavailable\\r\\n\\r\\nCheckout requests are failing.",
  "messageId": "<message-123@example.com>",
   "location": "London - UK"
}
```

## AI and knowledge providers

Set at least one server-side provider key: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. The assistant queries active alerts and indexed knowledge records in PostgreSQL, then searches any live sources whose credentials are configured. Provider secrets are never sent to client components. AI answers use retrieved context and are instructed to treat email and document content as untrusted data.

- SharePoint: configure a Microsoft Entra app with Microsoft Graph application permissions and admin consent. Set `SHAREPOINT_TENANT_ID`, `SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET`, and optionally `SHAREPOINT_SITE_ID`. The server requests a short-lived Graph token.
- Jira Cloud: set `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN`.
- Confluence Cloud: set `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, and `CONFLUENCE_API_TOKEN`.

Jira and Confluence use Atlassian API tokens with basic authentication. Grant each integration only the read permissions it needs. Provider search failures are isolated and reported in server logs; the assistant can still use other configured sources.

## GitHub promotion

Create an empty GitHub repository, then publish this workspace with a `main` branch and create `uat` from it. Git must be installed locally for these commands:

```powershell
git init -b main
git add .
git commit -m "Initialize Synopse"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
git switch -c uat
git push -u origin uat
```

1. Push and review changes on `main`; CI runs typecheck, lint, and build.
2. Merge `main` into `uat`. CI verifies the branch, then deploys it to Vercel's preview environment. Use the deployment URL in the Actions log or configure a stable branch domain in Vercel.
3. After UAT sign-off, run **Promote to production** from the Actions tab with the `uat` branch selected and enter `PROMOTE`. Configure required reviewers on the GitHub `production` environment for the release approval gate.

Set `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as GitHub Actions secrets. Set `DATABASE_URL` separately in the `uat` and `production` GitHub environments. Configure the same runtime application variables in the corresponding Vercel environments. The production workflow reruns verification and applies checked-in Prisma migrations before deployment.

## Checks

```powershell
npm run typecheck
npm run lint
npm run build
```

Keep `.env` and all provider secrets out of Git. The committed `.env.example` contains placeholders only.
