# SLP.Docs

SLP.Docs is a student operations workspace for therapy support work. It helps a therapist manage students, schedules, payment records, guardian messages, annual plans, monthly journals, sample templates, and month-end submission readiness in one app.

## Core Workflow

- Register student profile, guardian contact, therapy area, therapist, and weekly schedule.
- Upload payment records from CSV/XLS/XLSX with a preview before saving.
- Generate and edit annual plans and monthly journals.
- Compare monthly journal dates against payment records.
- Track schedule operation status such as planned, attended, absent, cancelled, and makeup.
- Write guardian messages from templates and open an SMS draft.
- Review the monthly submission dashboard to find missing documents, payment issues, and contact issues.

## Run Locally

Prerequisites:
- Node.js
- Firebase project configuration in `firebase-applet-config.json`
- `GEMINI_API_KEY` in `.env` for AI generation

Commands:

```bash
npm install
npm run dev
```

The local server exposes:

```bash
curl http://localhost:3000/api/health
```

## Single Operator Mode And Rules

This app is configured for a single operator and does not show an in-app login screen.

Important security boundary:

- Without user login, Firestore and Storage rules cannot distinguish the intended operator from another visitor.
- Deploy the app behind hosting-level access control, a private deployment URL, Vercel Deployment Protection, a private network, or an equivalent access boundary.
- App Check can reduce abuse from non-app clients, but it is not a user authorization system.
- The rules still validate known document shapes and block unknown collections.

Deploy rules:

```bash
npm run firestore:rules:deploy
npm run storage:rules:deploy
```

The app writes operational logs to these collections:

- `message_logs`
- `schedule_operation_records`
- `document_history`

## AI API

Production AI calls use Vercel serverless functions:

- `/api/ai/status`
- `/api/ai/generate`

These routes do not require app login. They keep server-side prompt size limits, model allowlisting, and in-memory rate limiting. Set these Vercel environment variables:

- `GEMINI_API_KEY`

Optional AI limits:

- `AI_MAX_PROMPT_CHARS`
- `AI_RATE_LIMIT_WINDOW_MS`
- `AI_RATE_LIMIT_MAX_REQUESTS`
- `GEMINI_ALLOWED_MODELS`

Local `.env` values are not available to Vercel unless added there.

## App Check

The browser client initializes Firebase App Check only when this Vite environment variable is set:

```bash
VITE_FIREBASE_APPCHECK_RECAPTCHA_SITE_KEY=
```

After configuring a reCAPTCHA v3 App Check provider in Firebase Console, set the key and then enforce App Check for Firestore, Storage, and callable/custom backend endpoints as appropriate.

## Template Uploads

Combined annual/monthly, annual-only, and monthly-only sample templates are stored in Firestore chunks under:

```text
document_templates/{templateId}/file_chunks
```

Use:

- `combined_journal` when one sample file contains both annual plan and monthly journal forms.
- `annual_plan` for annual-only templates.
- `monthly_journal` for monthly-only templates.

HWP, HWPX, and DOCX templates are automatically filled during document download when placeholders or recognized SLP sample table labels are present. Fallback downloads are valid DOCX files.

## Firebase Storage CORS

Some non-template uploads still use Firebase Storage. If uploads fail on production with a CORS preflight error, apply the bucket CORS policy:

```bash
npm run storage:cors
npm run storage:cors:show
```

This requires Google Cloud CLI authentication with permission to update the `slp-docs.firebasestorage.app` bucket.

## Known Technical Risks

- `xlsx` still reports high severity advisories with no upstream fix. Prefer CSV uploads for sensitive workflows until XLS/XLSX parsing is replaced or isolated.
- `src/App.tsx` is large and should be split into focused hooks/components for payment imports, message workflow, document state, and dashboard logic.
