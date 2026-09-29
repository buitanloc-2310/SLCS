# SLCS MASTER INVENTORY — V30 PRE-KIỆN TOÀN

Audit date: 2026-09-29
Baseline audited: V29 Website Editor (SLCS/SLCS)
Method: source/routes/UI/database/migrations/validators review. Static validation is not a substitute for browser/runtime testing.

## Status legend
- KEEP: present and structurally usable.
- COMPLETE: present but needs UX/runtime completion before release claim.
- REBUILD: feature exists but architecture/UX should be rebuilt.
- NEW: planned capability not yet implemented to requested scope.
- REMOVE: should be removed from active product/source in V30.

## 1. Public website
KEEP: landing page, login, account request, request lookup, activation, privacy, security, terms, public support, maintenance mode.
COMPLETE: unify typography/light theme, responsive checks, error/empty/loading states, CMS coverage of public content.

## 2. Authentication & account
KEEP: SFN ID/email login, logout, account activation, profile, avatar, password change, sessions/devices, account-request workflow.
COMPLETE: split Profile/Security/Sessions/Preferences into real navigable panes; add clearer validation and recovery UX.

## 3. Authenticated shell/dashboard
KEEP: dashboard, navigation, organization switcher, notifications shortcut, account chip.
REBUILD: authenticated layout must be modularized instead of one monolithic app.js render path. One canonical light design system: pale sky background, white surfaces, black/dark text, blue primary actions.

## 4. Classes
KEEP: class list/search, create class, join by code/link, class detail, feed/posts, class chat, schedule, QR/share/guest link, member list.
KEEP/COMPLETE: add member by SFN ID/email, roles Student/Assistant/Teacher, remove member, delete class with ownership protection and audit trail.
COMPLETE: class settings page, archive/restore class, transfer ownership, invitations/pending approvals, bulk member import, clearer permissions.

## 5. Learning materials
KEEP: class material upload, global resource library, file opening/search, quiz draft from supported documents.
COMPLETE: folders/categories, versioning, access rules, delete/archive, file metadata, storage quota UI, preview/download permissions.

## 6. Assignments
KEEP: assignment/task list, create action, student submit action, teacher grading entry point, submissions database.
REBUILD: full assignment editor, due dates, attachments, draft/publish, resubmission policy, rubric, submission viewer, grading workflow, feedback, late/missing states, gradebook integration.

## 7. Exam & Assessment Center
CURRENT: exams, exam_attempts, start/resume/submit flow, duration, strict mode, local/server answer recovery, active-exam redirect/lock.
REBUILD as a first-class system module, not only a class tab.

### Required Exam Center scope
NEW: Exam Center dashboard: Upcoming / Open / In progress / Submitted / Grading / Results / Closed.
NEW: Exam Lobby with rules, compatibility check, acknowledgement and start authorization.
NEW: Exam Builder with steps: Information -> Sections -> Questions -> Configuration -> Supervision -> Grading -> Publication -> Preview.
NEW: question types: single choice, multiple choice, true/false, short answer, essay, matching, ordering, passage/group questions, image/audio/video/file stimulus.
NEW: Question Bank organized by subject/class/topic/chapter/difficulty/tags, search/filter/import/duplicate/archive.
NEW: random question pools and blueprint/weight rules.
NEW: sections with independent points/time/navigation policy.
NEW: autosave, offline-safe local queue, reconnect reconciliation, server-authoritative deadline and submission state.
NEW: marking queue, objective auto-grade, essay/manual grading, rubric, feedback, publish results, grade-change audit.
NEW: Gradebook with weighted categories, missing/late/ungraded states, export.
NEW: Exam calendar and reminders.
NEW: Exam Monitor: not-started / active / disconnected / reconnected / submitted / closed.
NEW: teacher controls: extend time, authorize resume, reset/issue new attempt, close attempt.

### Strict supervised fullscreen mode
NEW: dedicated Exam Shell. During an attempt, hide SLC header/nav/footer/chat/class/account/external navigation and show only exam UI, timer, save state and submit controls.
NEW: require browser Fullscreen API before questions are revealed.
NEW: listen to fullscreenchange + visibility/page lifecycle events according to exam policy.
NEW: if the configured strict policy is triggered: persist latest answers/event -> server locks/closes attempt -> exit exam shell -> return candidate to Exam Center -> no self-resume until teacher/admin authorization.
NEW: Exam Event Log stores objective events and must not itself label a candidate as cheating.
LIMITATION: a normal website cannot truly block OS-level Alt+Tab/Home/other applications. True device lockdown requires kiosk/managed-device or a dedicated secure-browser approach.

## 8. Calendar & notifications
KEEP: calendar API/view, event timeline, notification center, mark all read.
COMPLETE: working Day/Week/Month modes (currently segmented controls are primarily visual), exam/assignment auto-events, reminder preferences, deep links.

## 9. Live Classroom
KEEP: prejoin, mic/camera/device selection, screen share, chat, people, hand raise, “Chưa hiểu”, reactions, teacher controls, teaching tools, layouts, fullscreen, camera switch, mirror, hide self, privacy blur, panic hide, guest access, reconnect/fallback/SFU foundations.
COMPLETE: production multi-device/browser verification, permissions/error UX, attendance/reporting, moderation, network-quality UI.
DECISION REQUIRED: Beauty Studio remains in source and entitlement system. Keep only if intentionally part of product; otherwise remove it cleanly in V30.

## 10. Support
KEEP: quick-help categories, create ticket, ticket list, admin ticket handling.
COMPLETE: ticket detail/thread, attachments, status history, assignee, SLA/priority semantics, notifications.

## 11. Administration
KEEP: users, single/bulk create, account requests, classes, tickets, announcements, email templates/logs, policies, export, cleanup, diagnostics, test email, organizations, subscriptions/entitlements/quota, School Studio, activity/audit foundations.
REBUILD: separate admin modules/routes; avoid concentrating Control Center rendering in app.js. Add permission matrix and audit visibility.

## 12. Website Editor / CMS
CURRENT: Website editor settings for identity, colors, homepage, footer, access/maintenance and announcements/config; live color preview/public preview.
REBUILD toward WordPress-like editor:
NEW: visual page tree and page editor.
NEW: block/section model with add/remove/duplicate/reorder.
NEW: inline editing for headings/text/buttons/images.
NEW: global Header/Footer/Menu editor.
NEW: desktop/tablet/mobile preview.
NEW: Draft / Preview / Publish states.
NEW: revision history, restore, undo/redo.
NEW: media library.
NEW: SEO/share metadata where appropriate.
NEW: role/permission controls for editors/publishers.
RULE: operational content/branding/theme/menu/footer/policies/announcements/email templates should be editable through UI; secrets, raw API credentials, database schema and security-critical internals must NOT be exposed as editable website fields.

## 13. Organizations / multi-tenant platform
KEEP: organizations, organization members, branding/settings/domains/subscriptions/usage/entitlements, org switcher and super-admin organization studio.
COMPLETE: tenant isolation/runtime verification, quotas, custom branding coverage, domain lifecycle and suspension behavior.

## 14. Data / migrations findings
The database contains broad foundations for users, sessions, classes, members, posts, materials, assignments, submissions, exams/attempts, calendar, notifications, live runtime/SFU, organizations, policies, support and audit.
V32: legacy assistant storage is decommissioned for fresh installs and a dedicated production migration removes the previously deployed tables/capability.

## 15. Architecture findings
- public/app.js currently owns too many pages and workflows; split by feature.
- styles.css + auth-shell.css must become one tokenized design system plus feature-scoped styles, not override-on-override patches.
- keep public shell and authenticated shell explicit.
- create dedicated modules: account, dashboard, classes, assignments, exams, resources, calendar, support, admin, cms, live.
- backend routes should mirror modules and use centralized auth/permission/audit helpers.

## 16. V30 release gates
1. Source inventory mapped to routes/APIs/tables/permissions.
2. No dead public navigation or UI-only controls presented as complete features.
3. Responsive browser render checks for public + every authenticated route.
4. Role matrix tested: student/assistant/teacher/account_admin/school_admin/super_admin/guest.
5. Destructive actions require confirmation + authorization + audit.
6. Exam strict mode tested for fullscreen exit, tab visibility, reload, network loss, reconnect, timeout, submit and teacher reauthorization.
7. CMS publish/revision permissions tested.
8. Production integrations tested separately; static validators cannot certify Cloudflare/D1/R2/email/SFU runtime.

## Current static baseline result
V29 `npm run validate:final`: PASS. P2.4 hardening 14/14; feature preservation 24/24. This only confirms the repository's static checks, not complete browser/runtime correctness.
