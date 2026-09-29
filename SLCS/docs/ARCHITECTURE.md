# Kiến trúc SLCS

SLCS được triển khai theo mô hình Cloudflare Pages + Pages Functions. API chuẩn nằm trong `src/index.js`; `functions/api/[[path]].js` chỉ là entry point chuyển tiếp để tránh hai backend phát triển lệch nhau.

## Các lớp hệ thống

1. **Public/Web Shell** — `public/index.html`, `public/app.js`, design system và public routes.
2. **Authentication & IAM** — session, account, role/permission và organization scope.
3. **Learning Core** — classes, materials, assignments, submissions, gradebook, attendance, progress.
4. **Assessment Center** — engine đánh giá dùng chung cho exam, quiz, evaluation, selection, survey và các profile tùy chỉnh.
5. **Live Classroom** — media client, classroom runtime, realtime/SFU foundation và fallback signaling.
6. **Website Studio** — branding/content configuration, revisions và publish workflow.
7. **Operations** — organization, automation, analytics, diagnostics và admin control.
8. **Persistence** — Cloudflare D1; migration lịch sử nằm trong `migrations/`. `src/schema-v11.js` là installer hợp nhất dùng cho bootstrap/repair schema.

## Nguyên tắc ổn định

- Normalize dữ liệu tại API/UI boundary; không giả định field nullable luôn tồn tại.
- API phụ phải degrade cục bộ thay vì kéo sập toàn shell.
- Permission quan trọng phải được kiểm tra ở server, không chỉ ẩn nút phía client.
- Migration đã phát hành không được đổi tên/xóa; thay đổi schema mới phải bổ sung migration kế tiếp.
- Asset public dùng build token để tránh cache JS/CSS cũ sau deploy.
- Không đặt secret hoặc khóa dịch vụ trong `public/`.

Xem `DEPLOY-CLOUDFLARE.md` ở thư mục gốc để triển khai.
