# V8 Web-first / Admin-first

Mục tiêu của V8 là giảm tối đa việc phải chạy code, SQL hoặc CLI trong quá trình vận hành thường ngày.

## Luồng lần đầu
1. Deploy Worker từ GitHub/Cloudflare.
2. Gắn D1 `DB`, R2 `FILES`, Durable Object `LIVE_ROOM` và secret `SETUP_TOKEN` / `RESEND_API_KEY` trong Cloudflare.
3. Mở website.
4. Nếu D1 còn trống, website tự hiển thị **Cài đặt dữ liệu nền tảng**.
5. Nhập `SETUP_TOKEN` và bấm cài đặt. Hệ thống tạo schema tự động.
6. Tạo Super Admin đầu tiên ngay trên web.
7. Đăng nhập Control Center và vận hành từ trình duyệt.

## Có thể làm trực tiếp trong Admin
- Duyệt yêu cầu cấp tài khoản và tự gửi email kích hoạt.
- Xem, phân quyền, khóa/mở tài khoản.
- Xem và lưu trữ/mở lại lớp.
- Xử lý ticket hỗ trợ.
- Chỉnh tiêu đề/nội dung giới thiệu public.
- Tạo thông báo public.
- Theo dõi nhật ký email và lỗi gửi thư.
- Xem tổng quan hệ thống.

## Khi nào vẫn cần deploy code?
Chỉ khi thay đổi logic ứng dụng, cấu trúc hạ tầng Cloudflare, nâng cấp phiên bản hoặc thêm module mới. Vận hành nội dung và người dùng hằng ngày không cần sửa code.
