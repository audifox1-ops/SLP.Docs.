# Monthly Payment Form Research - 2026-06-06

## Objective

Show uploaded Excel payment history inside the monthly journal, force generated lesson-date rows to follow payment dates when records exist, and keep weekly 1 / monthly 4 sessions as an editable default.

## Internal Findings

- `src/App.tsx` already parses CSV/XLS/XLSX payment uploads into `payment_records`, listens to all records, and filters them by selected student/year/month.
- Monthly generation already replaces AI-provided session dates with payment-record dates when records exist.
- The monthly journal form did not display the selected-month payment records and did not provide row add/remove controls for months that differ from 4 sessions.
- Default DOCX generation rendered the monthly session table but had no payment-history block.

## External Pattern Check

- https://github.com/archit-p/editable-react-table: editable React table patterns keep row state controlled and mutate through parent callbacks.
- https://github.com/firxworx/react-simple-invoice: invoice/payment-style UIs keep dynamic line items as explicit rows with add/remove actions.
- General implication from reviewed patterns: for this repo, avoid a new table dependency and extend the existing controlled `MonthlyJournal` table because the row count is small and document-layout fidelity matters more than sorting/filtering features.

## Local Decision

- Keep `App.tsx` as the source of truth for payment filtering and payment-date formatting.
- Add `paymentRecords`, `formatPaymentSessionDate`, and `onSyncPaymentDates` props to `MonthlyJournal`.
- Add edit-mode controls for syncing to payment dates, filling the default 4 rows, adding rows, and deleting rows.
- Render a printable `엑셀 결제 이력(선택 월)` table directly under the monthly session table.
- Extend default monthly DOCX export with the same payment-history block and pass payment records through preview, multi-month print, and default DOCX download paths.

## Verification

- `npm run lint`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.
- `curl http://localhost:3000/api/health`: returned `{"status":"ok"}`.
