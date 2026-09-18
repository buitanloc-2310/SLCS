# V10 Validation & Hardening Report

Date: 2026-09-14

## Automated checks completed
- JavaScript syntax: `src/index.js`, `src/live-room.js`, `public/app.js` passed `node --check`.
- D1 migrations: `0001` through `0006` applied successfully in order to a clean SQLite database.
- Resulting test schema: 37 tables.
- `wrangler.jsonc` parsed successfully as JSON.
- Required Sky First logo asset is present.
- Search found no TODO/FIXME/mock/sample-question placeholders in source/public/docs.

## V10 core hardening
- Class membership and role validation added to assignment and exam routes.
- Exam attempts support server-backed resume, local recovery and stale-attempt unlock.
- Exam submission now has server-side deadline enforcement with a short network grace window.
- Live classroom WebSocket identity is issued by short-lived server tokens instead of trusting client role/name parameters.
- Login failure throttling added without storing raw IP addresses.
- Upload validation, rollback on metadata failure and safer delivery of active-content file types added.
- Activation-token invalidation and session controls strengthened.
- Request IDs, generic 5xx responses, incident logging and system diagnostics added.
- Security headers added to API/static response flow.
- Control Center supports web-first operations and V10 schema upgrade.

## Architecture limits intentionally documented
- The built-in live classroom remains WebRTC mesh. V10 caps peers to protect the Worker/clients; large classes should move media to an SFU/TURN architecture.
- Browser exam mode can restrict the SLC web experience and record browser focus/fullscreen/copy/paste events, but a normal webpage cannot lock the entire operating system. A kiosk/exam client is required for stronger device-level lockdown.

## Release position
This release has been statically checked and schema-tested to minimize core defects. No software release can truthfully be guaranteed to contain zero defects, so production monitoring, backups and staged rollout remain recommended.
