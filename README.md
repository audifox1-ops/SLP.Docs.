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

## Firebase Auth And Rules

Production Firestore rules now require Firebase Authentication for student, payment, document, template, and history data.

Before deploying `firestore.rules`, enable:

- Firebase Console > Authentication > Sign-in method > Anonymous

The client can initialize anonymous auth when explicitly enabled. Keep it disabled while the Firebase project has no Anonymous provider, otherwise the browser will call `identitytoolkit.googleapis.com` and receive `auth/configuration-not-found`.

Enable the client-side anonymous auth call only after the Firebase Anonymous provider is active:

```bash
VITE_ENABLE_FIREBASE_ANONYMOUS_AUTH=true
```

Deploy rules:

```bash
npm run firestore:rules:deploy
```

The app writes operational logs to these collections:

- `message_logs`
- `schedule_operation_records`
- `document_history`

## AI API

Production AI calls use Vercel serverless functions:

- `/api/ai/status`
- `/api/ai/generate`

Set `GEMINI_API_KEY` in the Vercel project environment variables. Local `.env` values are not available to Vercel unless added there.

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
