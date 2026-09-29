# Trung tâm Học tập Số Sky First Network — V40 Production

SLCS V40 là bản production hợp nhất của hệ thống học tập số Sky First Network.

Các khối chính hiện có:
- Public website, SFN Account, yêu cầu/kích hoạt tài khoản.
- Dashboard, lớp học, học liệu, lịch, thông báo, hỗ trợ.
- Assignment, Gradebook, Progress, Attendance.
- Live Classroom và Cloudflare Realtime SFU/fallback signaling.
- Sky First Assessment Center cho thi, kiểm tra, đánh giá TNV, sát hạch, tuyển chọn, cuộc thi, khảo sát và loại tùy chỉnh.
- Website Studio, Control Center, Organization, IAM, Automation, Analytics.
- D1 cho dữ liệu, R2 cho file, Cloudflare Pages Functions cho API.

## Cấu trúc archive

```text
SLCS/
└── SLCS/
    ├── public/
    ├── src/
    ├── functions/
    ├── migrations/
    ├── scripts/
    ├── package.json
    └── wrangler.json
```

Khi deploy, dùng thư mục `SLCS/SLCS` làm project root.

## Kiểm tra production

```bash
npm install
npm run validate:production
```

## Migration và deploy

```bash
npm run db:migrate
npm run deploy
```

Trước deploy phải cấu hình secret Cloudflare phù hợp, tối thiểu `SETUP_TOKEN`; email cần `RESEND_API_KEY`; Cloudflare Realtime SFU cần `REALTIME_APP_ID` và `REALTIME_APP_SECRET`.

Xem `PRODUCTION-RELEASE-V40.md` và `DEPLOY-CLOUDFLARE.md`.
