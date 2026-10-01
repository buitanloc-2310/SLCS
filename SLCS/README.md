# Trung tâm Học tập Số Sky First Network (SLCS)

SLCS là nền tảng học tập số hợp nhất của Sky First Network, gồm website công khai, tài khoản, lớp học, Live Classroom, học liệu, bài tập, sổ điểm, điểm danh, tiến độ, Assessment Center, Website Studio, quản trị và vận hành tổ chức.

## Cấu trúc chính

- `public/`: giao diện web và các module trình duyệt.
- `src/`: API, xác thực, lớp học, đánh giá, realtime và logic nền tảng.
- `functions/`: Cloudflare Pages Functions, chuyển tiếp vào API chuẩn trong `src/`.
- `migrations/`: lịch sử migration D1. Không đổi tên hoặc xóa migration đã phát hành.
- `scripts/validate-production.mjs`: cổng kiểm tra production hợp nhất.

## Kiểm tra trước khi triển khai

```bash
npm run validate:production
```

Lệnh trên chạy kiểm tra cú pháp và release gate hợp nhất. Khi triển khai Cloudflare, tiếp tục áp dụng migration D1 trước khi deploy mã mới:

```bash
npm run deploy:production
```

`deploy:production` thực hiện: validate → D1 migrations → Pages deploy.

## Bảo mật tài khoản

Mật khẩu được băm bằng PBKDF2. Cấu hình hiện tại của hệ thống dùng 10.000 vòng theo yêu cầu vận hành của dự án. Không lưu mật khẩu thô.

## Dữ liệu và tương thích

Runtime có bước kiểm tra schema trước các API xác thực. Nếu database cũ/thiếu schema, installer hợp nhất sẽ bổ sung các migration còn thiếu trước khi tiếp tục request. Các migration lịch sử vẫn được giữ nguyên để tương thích D1 hiện có.

## Tài liệu

- `DEPLOY-CLOUDFLARE.md`: triển khai Cloudflare.
- `PRODUCTION-RELEASE.md`: checklist và phạm vi kiểm thử production.
- `docs/ARCHITECTURE.md`: kiến trúc hệ thống.
- `docs/D1-RUN.sql`: ghi chú D1 hỗ trợ vận hành.


---

# Archived validation and repair reports

The following non-runtime report files were folded into this README to keep the extracted project below the 100-file platform limit without removing application code, migrations, validators, or assets.


## Archived from `REPAIR-REPORT.md`

# SLC repair report — 2026-10-01

## Scope
Repair of the uploaded SLCS source, focused on live microphone/camera/audio reliability, error visibility, realtime fallback, and Assessment/Exam correctness.

## Live media fixes
- Cloudflare Realtime SFU publish, subscribe and ICE-recovery now wait for ICE gathering to complete before sending `pc.localDescription` to the backend.
- Subscriber renegotiation sends the gathered local answer rather than the raw `createAnswer()` SDP.
- SFU per-track API failures are rejected and surfaced instead of being treated as successful publications/subscriptions.
- SFU forced track cleanup now closes by MID with `force: true`.
- Media connection state is visible in the classroom header; recovery/failure states are no longer hidden.
- Speaker output selection reports unsupported browsers and `setSinkId()` failures, and applies the selected output to later remote media.
- Media heartbeat failures are visible and trigger recovery.
- Active microphone/camera tracks report device disconnection/end events to the user.
- Prejoin device enumeration and camera/micro permission/device failures now display readable messages; device hot-plug refresh is supported.
- Same-account sessions on two devices/tabs use distinct live peer identities based on the live access token.
- When `LIVE_ROOM` Durable Object is not bound, the client uses the Pages+D1 signaling fallback directly instead of intentionally failing WebSocket first.
- D1 fallback now supports the V13 classroom events used by the UI and routes whisper/ask-later/class-pulse to hosts only.
- `school_admin` and `super_admin` are included in host broadcasts.

## Assessment / Exam fixes
- Guest attempts persist `expired` state when time is exhausted.
- Guest submit is enforced server-side against the attempt deadline (with the existing 120-second submission grace), including administrator-added extra time.
- Guest `terminate_on_exit` now actually terminates the attempt and records an audit event.
- Guest maximum-attempt limits are enforced.
- Guest and authenticated attempts receive immutable question snapshots.
- `shuffle_questions` and `shuffle_options` now affect each attempt snapshot.
- `strict_mode`, `fullscreen_required`, and `terminate_on_exit` are independent settings; strict mode no longer silently forces the other two.
- Result policy is enforced server-side; hidden scores are redacted from API responses and the personal assessment center.
- `publish_later` has an administrator action to publish results.
- Guest submission returns to the public assessment flow instead of trying to open the authenticated assessment center.
- Exam autosave now shows synchronization state while retaining local-device backup.
- Duplicate `GET /api/notifications` route removed.

## Packaging / deploy reliability
- Added `package-lock.json`.
- Removed the local Wrangler dependency so `npm ci` is deterministic and offline-safe for project dependencies.
- Wrangler scripts use pinned `npx --yes wrangler@4.34.0`.
- Asset build token bumped to `20261001-media-assessment-repair`.

## Verification performed
- `npm ci --ignore-scripts --offline`: PASS
- `npm run check`: PASS
- `npm run validate:production`: 35/35 PASS
- All 30 `scripts/validate-*.mjs`: PASS
- Focused media + assessment repair validator: 28/28 PASS
- All 25 SQL migrations applied sequentially to a clean SQLite database: PASS
- ZIP integrity test: performed after packaging.

## Important deployment verification still required
Static/source validation cannot prove real camera/micro delivery through the production Cloudflare account. After deployment, perform a two-device test using two separate live sessions: mic A -> audio B, mic B -> audio A, camera both directions, mute/unmute, speaker selection where supported, device unplug/replug, network disconnect/reconnect, and Chrome/Safari as applicable. The source now reports failures instead of silently treating them as success.


## Archived from `docs/V10-VALIDATION-REPORT.md`

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


## Archived from `docs/V11-VALIDATION-REPORT.md`

# V11 Validation Report

Ngày kiểm tra: 2026-09-14

## Kết quả

- `npm run check`: PASS
- `src/index.js`: PASS
- `src/schema-v11.js`: PASS
- `src/live-room.js`: PASS
- `public/app.js`: PASS
- Pages Function route: PASS
- Schema parser: 6 stage, 60 câu SQL hoàn chỉnh
- Local SQLite fresh install: PASS
- Local SQLite retry lần 2: PASS
- Object sau cài: 36 table, 17 index, 1 trigger
- Seed `system_settings`: 23 mục
- Trigger giới hạn 10.000 tài khoản: tồn tại
- Installer runtime không gọi `DB.exec()`: PASS
- Installer runtime không chạy `PRAGMA foreign_keys`: PASS

## Thay đổi cốt lõi

V11 không vá tiếp installer V10.x. Installer được dựng lại từ đầu bằng module `src/schema-v11.js`. Mỗi câu SQL được gửi riêng tới D1 bằng `prepare().run()`.


## Archived from `docs/V35-UI-ARCHITECTURE-COMPLETION.md`

# V35 — UI/UX & Architecture Completion

V35 establishes one shared visual/runtime layer for the Digital Learning Center without removing business capabilities.

## Completed in this release
- One light, admin-controlled design language across public, authenticated, learning, assessment and administration surfaces.
- Shared route/area UI context (`ui-system.js`) separated from business/API logic.
- Responsive rules for desktop/tablet/mobile and route-aware density for Assessment, Admin and Live Classroom.
- Shared control/card/form/tab/toolbar behavior and visible keyboard focus.
- Reduced-motion support and cache-busted V35 assets.
- Website Studio editing chrome remains readable even if an administrator selects an extreme public palette.
- Existing V34 Assessment Engine, classes, accounts, live classroom, support, organizations and website settings are preserved.

## Deliberately not claimed
Static validation cannot prove Cloudflare/D1/email/SFU behavior in production. V35 is the UI/architecture completion baseline; production promotion still requires staging browser tests with real roles and bindings.


## Archived from `docs/releases/VPLUS-VALIDATION-REPORT.md`

# VPLUS FINAL — Release Validation Report

Build: `20.2.0-vplus-final`

## Automated release gate

- `npm run validate:vplus`: **PASS — 48 checks**
- JavaScript syntax checks: **PASS**
- Static import resolution: **PASS**
- Named import/export compatibility: **PASS**
- Non-admin technical leakage checks: **PASS**
- Secret identifier leakage checks: **PASS**
- AI permission/research/action guards: **PASS**
- AI Responses adapter mock: **PASS**
- AI research web-tool graceful fallback mock: **PASS**
- AI transient provider retry mock: **PASS**
- Fresh SQLite migration chain 0001→0010: **PASS**
- Fresh schema tables created: **64**
- Optimized UI logo present: **PASS**
- QR dependency removed from initial page load: **PASS**
- Static cache headers present: **PASS**
- Duplicate GET request coalescing: **PASS**
- Hidden-page SFU discovery suppression: **PASS**

## Important production boundary

These checks validate source structure, syntax, migration compatibility, packaging and mocked AI adapter behavior. Real Cloudflare bindings, the `skyfirsthoc` Realtime application, browser devices/networks, and an actual OpenAI account/API key can only be fully verified after deployment. VPLUS therefore uses fail-safe user messages and keeps technical diagnostics restricted to System Admin.

## Red + Orange hardening — 2026-10-01

This build closes the red/orange audit findings without increasing the deploy package above 100 source files.

Implemented: student privacy isolation for gradebook/member email/attendance; correct unlimited exam timing and extra-time reconciliation; reset/reopen clock repair; essay manual grading; assignment publish/late/resubmission enforcement; waiting-room admission across Durable Object and Pages+D1 fallback; organization-scoped admin reads/actions; first-load shuffled exam snapshots; guest Live attendance/resources/catch-up/poll answers; real microphone signal meter and speaker test; question-bank CRUD/import; working Assessment Admin tabs; short/matching/ordering scoring and UI; public-exam email OTP verification; full review after close; weighted gradebook totals; custom IAM role assignment/effective permissions; event-driven automation plus due/stale sweep; analytics event writes; and organization quota enforcement for classes, members, storage and live capacity.

Schema migration: `0024_red_orange_hardening.sql`.

Validation on this package: `npm ci` PASS; `npm run check` PASS; `npm run validate:production` 35/35 PASS; all 30 `validate-*.mjs` scripts PASS; red/orange media-assessment gate 52/52 PASS; all 26 migrations apply cleanly to a fresh SQLite database with `PRAGMA integrity_check = ok`.

Production-only verification still required after deployment: two-device real microphone/camera/audio transport, real Cloudflare Realtime credentials, real Email provider delivery for OTP, and real Durable Object binding behavior cannot be proven from the offline ZIP alone.
