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
