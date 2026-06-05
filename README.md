<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f6c3d59c-c8ab-4ba0-973b-32245977679a

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in `.env` to your Gemini API key. If Google reports the key as leaked, revoke it, create a new key, update `.env`, and restart the server.
3. Run the app:
   `npm run dev`

## Monthly Template Uploads

Combined annual/monthly, annual-only, and monthly-only sample templates are stored in Firestore chunks under `document_templates/{templateId}/file_chunks`, so the production upload flow does not depend on browser writes to Firebase Storage.

Use `combined_journal` when one sample file contains both the annual plan and monthly journal forms. Use `annual_plan` or `monthly_journal` only for separate templates. HWPX and DOCX templates are automatically filled during document download when they contain placeholders such as `{{studentName}}`, `{{annualCurrentLevelText}}`, `{{month1Goal}}`, `{{monthlyGoal}}`, or `{{session1Content}}`. Binary HWP files are stored for reference only; save the HWP in Hancom as HWPX before uploading if automatic form application is required.

After changing `firestore.rules`, deploy the rules before testing template uploads in production:

```bash
npm run firestore:rules:deploy
```

## Firebase Storage CORS

Other file uploads still use Firebase Storage. If those uploads fail on `https://slp-docs.vercel.app` with a CORS preflight error, apply the Storage bucket CORS policy:

```bash
npm run storage:cors
npm run storage:cors:show
```

This requires Google Cloud CLI authentication with permission to update the `slp-docs.firebasestorage.app` bucket. In Google Cloud Shell, run it from the repository root.
