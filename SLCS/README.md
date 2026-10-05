# Trung tâm Học tập Số Sky First — SLCS

Nền tảng Cloudflare Pages + Pages Functions quản lý tài khoản, lớp học, học liệu, bài tập, điểm danh, tiến độ, đánh giá, hỗ trợ và vận hành tổ chức.

## Bắt đầu

Chạy các lệnh trong thư mục chứa `package.json`, `wrangler.json`, `public/`, `src/` và `functions/`.

```bash
npm run build
npm run validate:all
npm run dev
```

- `build`: kiểm tra cú pháp và cổng kiểm tra production; `public/` đã là thư mục xuất bản, không cần bước bundling.
- `validate:all`: kiểm tra production và kiểm thử chức năng trên SQLite tạm. Cần Node.js >=22.13 cho `node:sqlite`.
- `dev`: chạy Pages tại máy để thử giao diện.
- Không đưa dữ liệu/tài khoản kiểm thử vào production. Bộ kiểm thử tạo database trong RAM rồi hủy.

## Triển khai

Xem `DEPLOY-CLOUDFLARE.md`. Root directory là thư mục `SLCS` trong ZIP; build command là `npm run build`, output directory là `public`.

Giữ D1 `DB` và R2 `FILES` đúng tài nguyên đang sử dụng. Thiết lập `SETUP_TOKEN` bằng Cloudflare secret, không đặt trong mã nguồn. Cấu hình nhà cung cấp email qua secret nếu cần kích hoạt tài khoản và OTP. Không khởi tạo lại tài khoản quản trị trên database đã có dữ liệu.

```bash
npm run db:migrate
npm run deploy
```

Domain thi riêng dùng `EXAM_URL`; ZIP này chứa hệ thống học tập/API, không chứa giao diện riêng của domain `exam.skyfirst.io.vn`. Cần giữ domain thi đang vận hành để luồng chuyển sang dự thi hoạt động.

## Bản nâng cấp 05/10/2026

- Đồng nhất giao diện công khai, đăng nhập, lớp, quản trị, bảng và hộp thoại theo màu trong Website Studio.
- Menu điện thoại có nút mở/đóng và đủ mục điều hướng; trang đang mở có trạng thái active.
- Nhãn biểu mẫu liên kết với trường nhập; hộp thoại hỗ trợ Tab/Escape và trả focus; có lối tắt đến nội dung chính.
- Đăng nhập có hiện/ẩn mật khẩu, trạng thái đang gửi và chống gửi trùng; lỗi mạng được hiển thị.
- Thời hạn session, token kích hoạt, OTP và access token so sánh bằng `datetime()` trong SQLite.
- Thời gian hệ thống SQLite được đọc theo UTC; lịch thi cũ chưa có múi giờ được đọc theo UTC+07:00. Phiên thi mới không hết hạn sớm theo múi giờ máy chủ.
- Cookie không hợp lệ không làm sập API; mật khẩu giữ nguyên khoảng trắng từ lúc tạo đến đăng nhập/đổi mật khẩu.
- API cache tách theo người dùng, tổ chức, bearer token và thế hệ dữ liệu; phản hồi 200 sai định dạng không bị coi là thành công.
- Điều hướng xử lý nối tiếp, sau request chậm sẽ cập nhật theo địa chỉ trang mới nhất.
- Nội dung chính sách được lọc HTML theo danh sách cho phép, loại mã thực thi và URL nguy hiểm.
- Xử lý phúc khảo kiểm tra tổ chức trước khi sửa.
- Dọn asset WebRTC đã ngừng sử dụng. Không xóa migration hoặc dữ liệu lịch sử.
- Cập nhật cache token để tải JS/CSS mới sau deploy.

## Phạm vi kiểm tra

Cổng chính: `npm run validate:all`. Kiểm tra bổ sung hiện hành:

```bash
node scripts/validate-config.mjs
node scripts/validate-class-management.mjs
node scripts/validate-assessment-schedule-hotfix.mjs
node scripts/validate-upload-import.mjs
node scripts/validate-exam-domain-split.mjs
```

Các script trong `scripts/history/` là kiểm tra của phiên bản trước (bao gồm video/AI đã ngừng dùng), giữ để tham khảo; không phải cổng phát hành hiện hành.

Kiểm thử offline không chứng minh giao diện đã hiển thị đúng trên mọi trình duyệt, email đã gửi thật, hoặc D1/R2/domain thi production đã được cấu hình đúng. Báo cáo chi tiết: `docs/UPGRADE-2026-10-05.md`.
