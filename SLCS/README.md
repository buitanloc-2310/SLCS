# Sky First Learning Center (SLCS)

SLCS is the **Digital Education Operations & Innovation control plane** for Sky First. It manages programs, cohorts, classes, people/context roles, sessions, attendance, materials, assignments, assessment configuration, item bank, marking, results, appeals, incidents, reporting, audit and operations. It is not a lesson player and does not provide a built-in video-conference runtime.

## Production architecture

- Cloudflare Pages / Functions
- D1 binding: `DB`
- R2 binding: `FILES`
- EXAM delivery domain: `https://exam.skyfirst.io.vn`
- Data model extension: `FIELD → PROGRAM → COHORT → CLASS → SESSION`
- Assessment packages are sealed/versioned when published. Candidate runtime is handled by EXAM.

## Safe release order

1. Run `npm run validate:all` locally.
2. Confirm there is no active exam/freeze window that forbids maintenance.
3. Apply additive D1 migrations explicitly with `npm run db:migrate` **outside exam time**.
4. Deploy EXAM and verify `/health` reports `available` and `local-d1`.
5. Deploy SLCS with `SLCS_RELEASE_READY=YES npm run deploy:production`.
6. Run post-deploy smoke tests. Never claim production verification from local tests alone.

`deploy:production` deliberately does **not** run D1 migrations automatically. This prevents a code deployment from silently applying schema changes during an active exam.

## Validation

- `npm run build` — syntax + production static contract.
- `npm run validate:runtime` — local ephemeral SQLite regression test.
- `npm run validate:all` — both suites.

Migration `0028_digital_education_operations_2026.sql` is additive. Do not rename or rewrite migrations already applied to production, do not reset D1, and do not commit secrets or local database/cache files.
