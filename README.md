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

## Firebase Auth, Roles, And Rules

Production Firestore rules require Firebase Authentication and a staff role for student, payment, document, template, and history data. Anonymous Auth alone is not treated as staff.

Enable one or both operator sign-in providers:

- Firebase Console > Authentication > Sign-in method > Google
- Firebase Console > Authentication > Sign-in method > Email/Password

Grant operator access with either:

- a Firebase custom claim: `{ "role": "admin" }`, `{ "role": "staff" }`, or `{ "admin": true }`
- a Firestore profile document at `users/{uid}` with `role: "admin"` or `role: "staff"`
- the verified bootstrap admin email configured by `VITE_BOOTSTRAP_ADMIN_EMAILS` and `SERVER_BOOTSTRAP_ADMIN_EMAILS`

Use `admin` for destructive tasks such as student deletion, payment-record cleanup, template upload/deletion, and user role management. Use `staff` for normal student, document, message, and schedule operations.

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
- `/api/operations/delete-student`

These routes now require a valid Firebase ID token. AI routes allow `admin` or `staff`; student deletion requires `admin`. Set these Vercel environment variables:

- `GEMINI_API_KEY`
- `FIREBASE_PROJECT_ID`
- `SERVER_BOOTSTRAP_ADMIN_EMAILS`

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
