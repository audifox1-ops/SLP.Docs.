# Working Log

## 2026-06-03

### Objective
- Add recommended feature 1: student schedule fields in Student Management.
- Add recommended feature 2: monthly journal date comparison preview between payment records and journal sessions.
- Keep this file updated so work can be resumed at any point.

### Current State
- Existing bug-risk fixes from the prior pass are still present in:
  - `src/App.tsx`
  - `src/components/ExportOptionsModal.tsx`
  - `src/components/ScheduleManager.tsx`
  - `src/components/StudentManagement.tsx`
- Feature 1 is implemented:
  - `StudentManagement` now initializes `scheduleDay`, `scheduleTime`, and `scheduleFrequency`.
  - Student cards show the saved class schedule.
  - Add/edit modal includes fields for class day, class time, and weekly frequency.
- Student add/edit modal now scrolls internally on smaller screens.
- Feature 2 is implemented:
  - `App` builds a monthly date comparison from selected-month payment records and current journal sessions.
  - Monthly journal view shows a non-printing date check panel above the document.
  - The panel reports payment count, journal session count, mismatch count, and row-by-row status.

### Next Steps
- None. Objective complete.

### Verification
- `npm run lint`: passed.
- `npm run build`: passed.
- Existing local server responds:
  - `http://localhost:3000/api/health` returns `{"status":"ok"}`.
  - `http://localhost:3000/` returns HTTP 200.
- Build warning remains: Vite reports a large JS chunk over 500 kB. This is not a functional failure.

### Completion Audit
- Feature 1 requirement: student schedule day/time/frequency can be entered and reviewed.
  - Evidence: `src/components/StudentManagement.tsx` contains schedule defaults, card display, and add/edit form controls.
- Feature 2 requirement: date comparison preview is available before saving/printing the monthly journal.
  - Evidence: `src/App.tsx` contains monthly payment/session comparison helpers and a non-printing date check panel in monthly journal view.
- Resume log requirement: keep a resumable work document.
  - Evidence: this `working.md` file records objective, implementation state, changed files, verification, and completion audit.

### Files Changed For This Objective
- `src/components/StudentManagement.tsx`
  - Added student schedule input and display fields.
  - Added scroll-safe modal layout.
- `src/App.tsx`
  - Added monthly payment/session date comparison helpers.
  - Added non-printing monthly date check panel above the monthly journal.
- `working.md`
  - Added resumable work log.
## 2026-06-05T16:09:31Z 2026-06-06-slpdocs-autoresearch-1

Status: running
Summary: Started karpathy-autoresearch source-folder cycle for SLP.Docs current repo
Metrics:
- lock_acquired: 1.0
Verifiers:
- project_probe detected node stack with npm run lint and npm run build
Next: Run baseline lint/build, inspect app for a small verifiable improvement candidate

## 2026-06-05T16:13:55Z 2026-06-06-slpdocs-autoresearch-1

Status: completed
Summary: Adopted Vite manualChunks vendor splitting to remove production build chunk warning
Decision: adopt
Metrics:
- baseline_largest_js_chunk_kb: 2080.9
- baseline_vite_chunk_warning_count: 1.0
- largest_js_chunk_kb: 452.16
- vite_chunk_warning_count: 0.0
Changed:
- AUTORESEARCH.md
- 12-research/bundle-chunking-2026-06-06.md
- vite.config.ts
- working.md
- .autoresearch/experiments.jsonl
Verifiers:
- npm run lint passed before and after candidate
- npm run build passed; largest JS chunk 452.16 kB; no Vite chunk-size warning
- ab_gate largest_js_chunk_kb 2080.90 -> 452.16 adopted
- ab_gate vite_chunk_warning_count 1 -> 0 adopted
- npm audit --omit=dev --audit-level=moderate still reports 8 existing vulnerabilities, including xlsx with no fix available
Next: Next cycle should address dependency security: apply safe npm audit fix without removing devDependencies, then evaluate xlsx replacement or constrained upload parsing
## 2026-06-05T16:16:46Z 2026-06-06-slpdocs-security-audit-fix

Status: running
Summary: Started dependency security cycle to apply safe npm audit fixes while preserving prior chunking changes
Metrics:
- baseline_audit_high: 2.0
- baseline_audit_vulnerabilities: 8.0
- lock_acquired: 1.0
Verifiers:
- npm audit --omit=dev --audit-level=moderate failed with 8 vulnerabilities; xlsx has no fix available
Next: Run npm audit fix, verify package/package-lock diff, then rerun lint/build/audit

## 2026-06-05T16:19:36Z 2026-06-06-slpdocs-security-audit-fix

Status: completed
Summary: Adopted safe npm audit lockfile fixes and constrained payment file parsing for residual xlsx risk
Decision: adopt
Metrics:
- audit_moderate: 0.0
- audit_vulnerabilities: 1.0
- baseline_audit_moderate: 6.0
- baseline_audit_vulnerabilities: 8.0
- payment_upload_guard_count: 4.0
- residual_audit_high: 1.0
Changed:
- package-lock.json
- src/App.tsx
- 12-research/dependency-security-2026-06-06.md
- working.md
- .autoresearch/experiments.jsonl
Verifiers:
- npm run lint passed
- npm run build passed; no Vite chunk-size warning
- npm audit --omit=dev --audit-level=moderate now reports only xlsx high with no fix available
- ab_gate npm_audit_vulnerability_count 8 -> 1 adopted
- ab_gate npm_audit_moderate_count 6 -> 0 adopted
Next: Full xlsx remediation remains: replace npm xlsx or adopt a maintained patched SheetJS distribution while preserving XLS/XLSX upload behavior

## 2026-06-06 Sample Template Form Sync

Objective:
- Uploaded sample forms must visibly and functionally affect the document form output path.

Current issue found:
- The app stored uploaded sample templates, and downloads could use dedicated annual/monthly templates.
- A combined sample template was not shown as the active annual/monthly form source in the on-screen document area.
- Single annual/monthly preview downloads did not fall back to the uploaded combined sample template.

Change:
- Treat `combined_journal` as the fallback sample template for annual and monthly outputs when a dedicated annual/monthly sample is not uploaded.
- Show the combined sample template banner in the annual/monthly form area as "통합 샘플 양식 · 연간 폼 적용" or "통합 샘플 양식 · 월간 폼 적용".
- Make PreviewModal single annual/monthly downloads use the combined sample template when no dedicated sample exists.

Verification:
- `npm run lint`: passed.
- `npm run build`: passed.

Completion audit:
- Upload path: `document_templates/combined_journal`, `annual_plan`, and `monthly_journal` still store uploaded samples through Firestore chunks.
- Form/output sync: a combined sample now appears as the effective annual/monthly sample source when no dedicated sample exists.
- Preview/download sync: PreviewModal now uses the combined sample for single annual/monthly downloads when no dedicated annual/monthly sample exists.

## 2026-06-06 Gemini 429 Handling

Objective:
- Avoid repeated `/api/ai/generate` quota calls and noisy red console logs when Gemini returns 429 quota exhaustion.

Current issue found:
- Production API correctly returned 429 for quota exhaustion, but repeated UI actions could immediately call the same endpoint again.
- Local `server.ts` returned error payloads without matching HTTP error status.
- App-level generation handlers logged quota failures with `console.error`, creating noisy "generation failed" console errors even when fallback drafts were generated.

Change:
- Add `Retry-After` metadata for Gemini quota errors in serverless and local API handlers.
- Make local `server.ts` return the normalized HTTP status for AI errors.
- Add client-side quota cooldown so immediate repeated generation attempts do not hit `/api/ai/generate` again.
- Guard AI generation handlers/buttons while generation is already in progress.
- Log quota failures with `console.warn` while preserving `console.error` for unexpected failures.

Verification:
- `npm run lint`: passed.
- `npm run build`: passed.
- `curl /api/health`: HTTP 200.
- `curl -X POST /api/ai/generate` with an empty prompt: HTTP 400 with structured error JSON.

Completion audit:
- 429 response handling: serverless and local API now attach `retryAfterSeconds`/`Retry-After` for quota errors.
- Duplicate request prevention: client keeps a quota cooldown after `GEMINI_QUOTA_EXCEEDED` and blocks immediate repeated `/api/ai/generate` calls.
- UI prevention: AI generation controls are disabled while generation or batch generation is already running.
- Console noise: known quota failures are logged as warnings, while unexpected generation failures remain errors.

## 2026-06-06 Default Chayunwoo Sample Form

Objective:
- The built-in annual plan and monthly journal forms should match the uploaded sample file `치료기관 연간계획서 및 일지 양식-차윤우25.6~26.6.hwp` without requiring the user to upload the sample each time.

Sample structure extracted from local HWP:
- Annual title: `2025. 교육청 치료지원(마중물) 대상 연간 계획서`
- Annual info table: `학생명 / 생년월일 / 소속 학교 (유치원) / 장애 유형 / 치료 영역 / 치료 일정`
- Annual schedule block: `치료 기간 / 치료사 / 복지부 바우처 이용 영역 / 요일 / 시간 / 횟수`
- Annual plan table: `월 / 단기 목표(월 목표) / 치료 내용 / 비고`
- Monthly title: `2025. 교육청 치료지원(마중물) 대상 개별 치료 일지(6월)`
- Monthly info table: `학생명 / 생년월일 / 소속학교 (유치원) / 장애 유형 / 치료 영역 / 치료 일정`

Change:
- Update the default AnnualPlan React form to include `치료 영역`, `복지부 바우처 이용 영역`, and `횟수`.
- Keep the default MonthlyJournal form aligned with the sample and normalize the frequency display.
- Update default DOCX export sections to use the same annual/monthly sample field structure.

Verification:
- `npm run lint`: passed.
- `npm run build`: passed.

Completion audit:
- Annual React form now has the sample's six-column info table, including `치료 영역` and nested schedule rows for `복지부 바우처 이용 영역` and `횟수`.
- Monthly React form keeps the sample's six-column info table and now normalizes `횟수` display.
- Default DOCX export now mirrors the sample's annual plan table columns and monthly title/schedule structure.
## 2026-06-05T22:40:19Z 2026-06-06-payment-dates-monthly-form

Status: running
Summary: Started monthly payment-history/date-sync form cycle
Metrics:
- lock_acquired: 1.0
Verifiers:
- project_probe detected node stack with npm run lint and npm run build
Next: Inspect App monthly payment helpers and MonthlyJournal render, then implement payment-history rows and editable session-count controls
## 2026-06-05T22:46:49Z 2026-06-06-payment-dates-monthly-form

Status: completed
Summary: Adopted monthly payment-history display, payment-date sync control, editable monthly session rows, and default DOCX payment-history export
Decision: adopt
Metrics:
- default_session_count: 4.0
- payment_history_table_count: 2.0
Changed:
- 12-research/monthly-payment-form-2026-06-06.md
- src/App.tsx
- src/components/MonthlyJournal.tsx
- src/components/PreviewModal.tsx
- src/utils/docxExport.ts
- working.md
- .autoresearch/experiments.jsonl
Verifiers:
- npm run lint passed
- npm run build passed
- git diff --check passed
- curl http://localhost:3000/api/health returned {"status":"ok"}
- npm audit --omit=dev --audit-level=moderate still fails on xlsx high severity with no fix available
Next: User can test http://localhost:3000 by selecting a student/month with uploaded payment records, clicking edit, and using 결제일 기준 맞추기 if needed
## 2026-06-05T22:48:13Z 2026-06-06-payment-dates-monthly-form-final

Status: completed
Summary: Final verifier refresh after document wording trim
Decision: adopt
Changed:
- src/components/MonthlyJournal.tsx
- working.md
Verifiers:
- npm run lint passed
- npm run build passed
Next: Ready for user testing at http://localhost:3000

## 2026-06-06 Monthly Journal Bottom Payment Text

Objective:
- 월간일지 회기 날짜 셀에서 수업시간 표시를 제거한다.
- 월간일지 결제 내역을 표가 아닌 텍스트 목록으로 바꾸고 문서 최하단에 배치한다.
- 연간계획서와 월간일지 기본 양식이 샘플 구조와 일치하는지 재확인한다.
- 작업 내역을 Markdown으로 남겨 중단 후 이어서 작업할 수 있게 한다.

Change:
- `src/App.tsx`
  - `formatSessionDate`가 새 월간일지 날짜를 `M/D(요일)` 형식으로만 저장하도록 변경했다.
  - 월간일지 컴포넌트에 더 이상 결제일 포맷 콜백을 넘기지 않는다.
- `src/components/MonthlyJournal.tsx`
  - 날짜 편집 팝업에서 시간 입력/빠른 선택을 제거했다.
  - 기존 저장 데이터에 시간이 남아 있어도 회기 날짜 셀에는 첫 줄의 날짜만 표시한다.
  - 결제 내역 표를 제거하고, 치료 결과 아래 최하단에 `결제 내역` 텍스트 목록으로 배치했다.
- `src/utils/docxExport.ts`
  - 기본 DOCX 월간일지 회기 날짜도 날짜만 출력한다.
  - 기본 DOCX 결제 내역을 표에서 텍스트 문단 목록으로 변경하고 치료 결과 뒤 최하단에 배치했다.
  - 연간/월간 기본 DOCX 정보표의 소속학교 헤더에 `(유치원)`을 반영했다.
- `src/utils/monthlyTemplateExport.ts`
  - 샘플 템플릿 자동 적용 시 월간 회기 날짜 placeholder와 의미 기반 표 채우기도 날짜만 사용하도록 변경했다.
- `src/components/AnnualPlan.tsx`
  - 샘플 연간 계획표 구조와 맞도록 첫 번째 열 헤더를 `년월`에서 `월`로 변경했다.

Sample form recheck:
- 연간계획서 React form: 제목, 결재란, `학생명 / 생년월일 / 소속 학교 (유치원) / 장애 유형 / 치료 영역 / 치료 일정`, 치료 일정 세부 항목, `현행 수준 및 특성`, `장기 치료 목표`, `월 / 단기 목표(월 목표) / 치료 내용 / 비고` 구조 확인.
- 월간일지 React form: 제목, 결재란, `학생명 / 생년월일 / 소속학교 (유치원) / 장애 유형 / 치료 영역 / 치료 일정`, 현행 수준, 월 치료 목표, 회기별 일지, 치료 결과, 최하단 결제 내역 텍스트 구조 확인.
- 기본 DOCX export: React 기본 양식의 연간/월간 주요 헤더와 월간 결제 내역 배치를 동일하게 맞춤.

Verification:
- `git diff --check`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.

Next if interrupted:
- Run `git diff --check && npm run lint && npm run build` after any further edit.
- If visual verification is needed, open `http://localhost:3000`, select a student/month with payment records, and confirm 월간일지 bottom `결제 내역` is text-only and below `치료 결과`.

## 2026-06-06 Editable Form Fields And Date Cleanup

Objective:
- 월간일지 날짜에서 요일 표시를 제거한다.
- 월간일지 최하단 결제 내역을 표가 아닌 텍스트 열 형태로 최대한 정렬한다.
- 연간계획서와 월간일지의 기본 정보/치료 일정 등 문서 영역을 편집 가능하게 한다.
- 연간계획서 년월 설정 방식을 기존 치료 일정 셀 내부 방식에서 별도 편집 도구 방식으로 변경한다.

Change:
- `src/types.ts`
  - 연간/월간 문서별 학생 정보 override를 저장하는 `DocumentStudentOverrides`를 추가했다.
  - 연간 계획표 `비고` 편집을 위해 월별 목표에 `note` 필드를 추가했다.
- `src/utils/documentStudentOverrides.ts`
  - 학생 기본 정보와 문서별 override를 합치는 공통 helper를 추가했다.
- `src/App.tsx`
  - 월간일지 날짜 생성 형식을 `M/D`로 변경하고 기존 요일 문자열을 제거하도록 정리했다.
- `src/components/AnnualPlan.tsx`
  - 학생명, 생년월일, 학교, 장애 유형, 치료 영역, 치료사, 바우처 영역, 요일, 시간, 횟수를 편집 가능하게 했다.
  - 연간계획서 년월 설정을 별도 `연간계획서 년월 설정` 편집 도구로 이동했다.
  - 연간 계획표 `비고` 열을 편집 가능하게 했다.
- `src/components/MonthlyJournal.tsx`
  - 날짜 편집/표시를 `M/D`로 변경하고 기존 저장값의 요일 표시도 숨긴다.
  - 학생명, 생년월일, 학교, 장애 유형, 치료 영역, 치료사, 요일, 시간, 횟수를 편집 가능하게 했다.
  - 결제 내역을 텍스트 기반 grid 열로 정렬했다.
- `src/utils/docxExport.ts`
  - 기본 DOCX 출력이 문서별 override, 날짜 `M/D`, 연간 `비고`, 결제 내역 텍스트 열을 반영하도록 변경했다.
- `src/utils/monthlyTemplateExport.ts`
  - 샘플 템플릿 자동 적용도 문서별 override, 날짜 `M/D`, 연간 `비고`를 반영하도록 변경했다.
- `src/utils/annualPlanPeriod.ts`
  - 연간 기간 변경 시 월별 `비고` 내용을 보존한다.

Verification:
- `git diff --check`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.

Next if interrupted:
- Re-run `git diff --check && npm run lint && npm run build`.
- In the UI, select edit mode and confirm annual/monthly basic fields are editable, monthly dates show no weekday, and bottom payment rows align by 회차/결제일/시간/영역/금액.

## 2026-06-07 Monthly Journal Sample Refinement

Objective:
- 사용자가 월간일지 양식이 아직 만족스럽지 않다고 했으므로, 앞선 요청을 유지하면서 실제 샘플 월간일지 HWP를 다시 확인해 기본 월간일지 표시를 더 맞춘다.

Actual sample checked:
- Local sample: `/Users/audifox/Downloads/차윤우 월간일지25.6.hwp`
- Extracted title: `2025. 교육청 치료지원 대상 개별 치료 일지(03월)`
- Extracted info table: `학생명 / 생년월일 / 소속학교 (유치원) / 장애 유형 / 치료 영역 / 치료 일정`
- Extracted schedule rows: `치료 기간 / 치료사 / 요일 / 시간 / 횟수`
- Extracted section labels: `현행 수준`, `(03)월 치료목표`, `날짜 / 치료 내용 / 아동 반응 / 비고(부모 상담)`, `(03)월 치료결과`
- Extracted date style: `03/06(목) 14:50~15:30`; user requested weekday/time removal, so implementation keeps sample's 2-digit month/day but omits weekday/time.

Change:
- `src/components/MonthlyJournal.tsx`
  - Title changed to `교육청 치료지원 대상 개별 치료 일지(03월)` style, removing `(마중물)` from monthly title.
  - Month labels now use 2 digits: `03월`, `(03)월 치료목표`, `(03)월 치료결과`.
  - Date editor and display now use zero-padded `MM/DD` such as `03/06`.
  - Monthly title underline removed to better match the sample title presentation.
- `src/App.tsx`
  - Generated/synced monthly session dates now use `MM/DD`.
- `src/utils/docxExport.ts`
  - Default DOCX monthly title/goal/result labels now use the same sample month style and no `(마중물)` in the monthly title.
  - Default DOCX monthly session date output now zero-pads old and new dates.
- `src/utils/monthlyTemplateExport.ts`
  - Template monthly title, month placeholder, semantic labels, and session dates now use the same sample month/date style.

Verification:
- `git diff --check`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.

Next if interrupted:
- Re-run `git diff --check && npm run lint && npm run build`.
- In the UI, confirm the monthly journal title reads `교육청 치료지원 대상 개별 치료 일지(03월)` style, date cells read `MM/DD`, and labels read `(MM)월 치료목표/치료결과`.

## 2026-06-07 Student Info Save And Schedule Input

Objective:
- 학생정보관리에서 학생 정보를 수정 후 저장할 때 오래 로딩되는 현상을 줄인다.
- 수업 요일 선택을 다시 점검한다.
- 수업 시간은 사용자가 직접 입력할 수 있는 형태로 제공한다.
- 샘플 양식과 다시 비교해 연간계획서와 월간일지의 기본 작성 흐름이 맞는지 확인한다.

Actual samples checked:
- `/Users/audifox/Downloads/차윤우 월간일지25.6.hwp`
  - Monthly schedule rows: `치료 기간 / 치료사 / 요일 / 시간 / 횟수`.
  - Sample monthly values include `요일: 목요일`, `시간: 14:50~15:30`, `횟수: 주 1 회`.
- `/Users/audifox/Downloads/치료기관 연간 계획서 및 일지 양식-차윤우25.6~26.6.hwp`
  - Annual info table: `학생명 / 생년월일 / 소속 학교 (유치원) / 장애 유형 / 치료 영역 / 치료 일정`.
  - Annual schedule rows include `치료 기간 / 치료사 / 복지부 바우처 이용 영역 / 요일 / 시간 / 횟수`.
  - Annual plan table: `월 / 단기 목표(월 목표) / 치료 내용 / 비고`.

Change:
- `src/components/StudentManagement.tsx`
  - Edit-save now closes the modal immediately after submit.
  - Student form values are trimmed/normalized before save.
  - Class day selection stores standard full weekday labels such as `목요일`; old non-standard values are preserved in the select instead of disappearing.
  - Class time is now a plain text input without fixed datalist suggestions.
- `src/utils/studentSchedule.ts`
  - Added shared schedule day/time/frequency normalization helpers and weekday-to-calendar-day mapping.
- `src/App.tsx`
  - Same-name student edits now write only editable profile/schedule fields with Firestore merge instead of rewriting large `referenceData`/attachment fields.
  - Student add/update is reflected optimistically in local state.
  - Student rename uses one Firestore batch for new document creation and old document deletion.
  - Selected-student sync now uses cached student/payment maps instead of filtering all payment records on every student-info update.
- `src/components/ScheduleManager.tsx`
  - Calendar expected schedule matching now uses the shared weekday normalization helper.

Verification:
- `git diff --check`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.

Next if interrupted:
- Run `git diff --check && npm run lint && npm run build`.
- In the UI, edit a student, change `수업 요일` and directly type a `수업 시간`; confirm save closes immediately and annual/monthly schedule rows show the changed values.

## 2026-06-07 Student Workspace Sidebar

Objective:
- 좌측 사이드바를 만들어 학생별로 모든 기능을 관리할 수 있게 한다.

Change:
- `src/App.tsx`
  - 문서 화면 안에만 있던 학생 목록을 전역 좌측 `학생별 관리` 사이드바로 이동했다.
  - 좌측 사이드바에서 학생 검색/선택, 연간계획서, 월간일지, 학생정보, 시간표, 임시저장, 양식, 프롬프트, 파일 업로드, 전체 초기화에 접근할 수 있게 했다.
  - 선택 학생 요약 영역에 치료 영역, 소속, 연간 저장 여부, 해당 월 저장 여부, 임시저장 개수를 표시한다.
  - 학생 목록의 연간/월간/임시 상태 배지를 기존 문서 상태와 연결해 유지했다.
  - 학생을 사이드바에서 선택하면 문서 워크스페이스로 이동하고 해당 학생 데이터를 불러오도록 했다.
  - 모바일/작은 화면에는 좌측 사이드바 대신 학생 선택과 핵심 기능 전환을 위한 압축 바를 추가했다.

Verification:
- `git diff --check`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `curl -fsS http://localhost:3000/api/health`: passed.

Next if interrupted:
- Re-run `git diff --check && npm run lint && npm run build`.
- In the UI, confirm the left sidebar appears on desktop after student/payment data is available, selecting a student opens the document workspace, and sidebar buttons switch annual/monthly/docs/student info/schedule/draft/template flows.

## 2026-06-07 Student Management App Home

Objective:
- 앱의 초기 화면을 학생관리 앱처럼 구성한다.
- 데이터 업로드를 초기 화면의 중심이 아니라 학생관리 앱의 일부 기능으로 귀속시킨다.
- 교육청/기타 서류작성, 학생 수업관리, 수업료 결제일 자동설정, 메시지 발신 기능까지 갖춘 운영 앱 형태로 보이게 한다.

Change:
- `src/App.tsx`
  - 기존 업로드 중심 히어로 화면을 `학생 운영 관리` 대시보드로 교체했다.
  - 첫 화면에 등록 학생, 결제 기록, 저장 문서, 임시저장 현황 카드를 표시한다.
  - 학생관리, 수업관리, 서류작성, 메시지 발신을 주요 업무 카드로 배치했다.
  - 결제내역 업로드를 별도 업무 카드와 상단/사이드바 업로드 액션으로 이동해 학생관리 앱 내부 기능처럼 배치했다.
  - 수업료 결제일 자동설정 카드에서 선택 학생의 월간일지가 있으면 `결제일 기준 맞추기`를 바로 실행하고, 없으면 월간일지 화면으로 안내한다.
  - 메시지 발신 모달을 추가해 선택 학생/월 기준 수업 일정, 결제 기록, 문서 작성 상태 안내문을 생성하고, 복사 또는 문자앱 열기를 지원한다.

Verification:
- `git diff --check`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.

Next if interrupted:
- Re-run `git diff --check && npm run lint && npm run build`.
- In the UI, confirm the first screen is a student operations dashboard, not an upload-only landing screen, and that upload/message/payment-date actions are reachable from that dashboard.
