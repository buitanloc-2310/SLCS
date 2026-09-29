# Deploy Cloudflare — SLCS V40 Production

## Project root
Sau khi giải nén, dùng thư mục trong cùng `SLCS/SLCS` làm root.

## Cloudflare Pages
- Framework preset: **None**
- Build command: `npm install && npm run validate:production`
- Build output directory: `public`

Thư mục `/functions` được Cloudflare Pages deploy cùng site và route `/api/*` đã được khai báo trong `public/_routes.json`.

## Bindings hiện có trong `wrangler.json`
- D1: `DB` -> `skyfirsthoctap`
- R2: `FILES` -> `skyfirsthoctap`

## Secrets / variables cần cấu hình
Không ghi secret vào source hoặc commit Git.
- `SETUP_TOKEN` — bắt buộc cho khởi tạo/cài schema lần đầu.
- `RESEND_API_KEY` — cần nếu dùng gửi email.
- `REALTIME_APP_ID` và `REALTIME_APP_SECRET` — cần khi bật Cloudflare Realtime SFU.
- `BEAUTY_OWNER_USER_ID` — tùy chọn nếu dùng entitlement Beauty riêng.

Các biến không nhạy cảm như `APP_URL`, `SUPPORT_EMAIL`, `APP_NAME`, `MAIL_FROM`, `REALTIME_API_BASE`, `REALTIME_APP_NAME` đã có cấu hình mặc định trong `wrangler.json`.

## Thứ tự production
1. `npm install`
2. `npm run validate:production`
3. Cấu hình bindings/secrets trên Cloudflare.
4. `npm run db:migrate`
5. `npm run deploy`
6. Kiểm tra `/api/health`, `/api/setup/status`, đăng nhập, Dashboard, lớp học, Assessment, Control Center và một phiên Live Classroom thật.

Không chạy migration lại bằng cách xóa/đổi tên migration cũ. Lịch sử migration hiện tại được giữ để tương thích D1.
