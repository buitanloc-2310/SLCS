# Triển khai Cloudflare Pages

1. Giải nén ZIP. Chọn thư mục chứa `package.json` làm root directory (thư mục `SLCS`). Build command: `npm run build`. Output directory: `public`.
2. Xác nhận `wrangler.json`: Pages project `slc`, D1 binding `DB`, R2 binding `FILES`, `APP_URL` và `EXAM_URL` trỏ đúng tài nguyên/domain đang dùng.
3. Đặt `SETUP_TOKEN` qua Cloudflare secret. Các secret email hiện có phải được giữ nếu dùng gửi thư; không ghi secret trong source/public.
4. Với máy chạy Node.js >=22.13, chạy `npm run validate:all`.
5. Chạy `npm run db:migrate` rồi `npm run deploy`, hoặc `npm run deploy:production`. Các lệnh này cần quyền truy cập tài khoản Cloudflare của bạn.
6. Database mới: mở website, cài đặt dữ liệu nền tảng và tạo quản trị đầu tiên bằng `SETUP_TOKEN`. Database cũ: giữ tài khoản và dữ liệu, không reset hoặc khởi tạo lại.
7. Kiểm tra domain thật: đăng nhập → dashboard → lớp học → từng tab; tạo bài đánh giá → chuyển domain dự thi → nộp bài; tải học liệu R2; gửi email kích hoạt/OTP; hỗ trợ, Website Studio và quản trị theo vai trò.
8. Trên điện thoại: mở Menu, chọn Lớp học/Lịch/Học liệu/Tài khoản; kiểm tra trường nhập, nút, hộp thoại và bảng không đẩy trang vượt màn hình.

`public/` đã là đầu ra tĩnh. Build dùng để kiểm tra trước phát hành, không tạo thư mục `dist`.

Không cần cấu hình SFU/Durable Object hay quyền mic/camera cho bản này. UI dự thi của `exam.skyfirst.io.vn` được triển khai riêng và không nằm trong ZIP này.
