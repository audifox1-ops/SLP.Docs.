# Monthly Close Action Routing

## Source Evidence

- GOV.UK Design System task-list guidance says task lists fit long, complex services when users may complete work across sessions and choose task order.
- GOV.UK task-list examples pair each task with a status, and research notes call out that incomplete tasks should remain easy to scan.
- The `alphagov/govuk-frontend` GitHub task-list component provides the open-source implementation reference for task rows with title, optional hint, status, and link behavior.

## Baseline

SLP.Docs already had a monthly close table with per-student statuses for annual plan, monthly journal, payment, contact readiness, and a status summary.

The row action was always `월간 열기`. That was weak for rows blocked by an annual plan, payment import, or missing guardian contact consent because the button did not route the operator to the first blocking task.

## Candidate

Add row-level action routing:

- Missing annual plan -> `연간 열기`
- Missing monthly journal -> `월간 열기`
- Payment not ready -> `결제 업로드`
- Contact/consent not ready -> `학생정보`
- Ready row -> `월간 보기`

Also show the blocking issue names as compact chips under the status count.

## A/B Result

Metric: number of distinct first-blocker actions available from the monthly close table.

- Baseline: 1 static action label.
- Candidate: 5 action labels tied to the row's first incomplete task.

Guard: no data model, Firestore, generation, or export behavior changed. The patch only changes dashboard routing and visibility.

Decision: adopt if lint/build pass.
