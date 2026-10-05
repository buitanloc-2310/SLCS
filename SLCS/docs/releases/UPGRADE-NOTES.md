# Nâng cấp phòng học trực tuyến

Bản này được nâng trực tiếp từ `slc-main.zip` do người dùng cung cấp.

## Thay đổi thực tế
- Giao diện phòng học được tách hoàn toàn khỏi giao diện lớp học thông thường.
- Micro/camera hoạt động độc lập với signaling: một người ở phòng vẫn có thể bật/tắt và xem preview.
- Camera 720p mục tiêu, echo cancellation, noise suppression, auto gain control.
- Chọn micro/camera/loa, đổi camera trước/sau trên thiết bị di động.
- Audio meter kiểm tra micro.
- Chia sẻ màn hình, toàn màn hình, giơ tay, phản ứng.
- Panel Thảo luận / Mọi người / Thiết bị.
- Chat có fallback qua API lớp học khi WebSocket realtime chưa được liên kết.
- Tự reconnect WebSocket khi dịch vụ realtime có sẵn.
- Responsive desktop/tablet/mobile và dùng `playsinline` cho iOS/iPadOS.
- Endpoint `/api/live/capabilities` cho biết trạng thái realtime mà không làm hỏng phòng khi thiếu Durable Object.

## Lưu ý hạ tầng
Cloudflare Pages giữ vai trò deployment chính. WebSocket/Durable Object có thể được dùng khi môi trường có binding; khi không có, source dùng Pages Functions + D1 làm kênh signaling/presence dự phòng. Media quy mô lớp học vẫn ưu tiên Cloudflare Realtime/SFU.

## Baseline bảo toàn
PBKDF2 giữ nguyên `iterations: 10000` theo source người dùng cung cấp.


---

## Tài liệu lịch sử: UPGRADE-V7.md

# V7 — Public + Account Flow Upgrade

- Public homepage được viết lại theo nội dung thật, không còn copy kiểu demo.
- Tên đầy đủ được ưu tiên: Trung tâm Học tập Số Sky First Network / Sky First Network Digital Learning Center.
- Không hiển thị thông tin kỹ thuật như giới hạn 10.000 tài khoản trên public homepage.
- Footer mới: sản phẩm thuộc hệ sinh thái Sky First Network; quyền riêng tư, bảo mật, điều khoản và hỗ trợ.
- Tự phát hiện hệ thống chưa khởi tạo và mở màn hình bootstrap đầu tiên.
- Yêu cầu cấp tài khoản gửi email xác nhận tự động từ `slc@skyfirst.io.vn`.
- Mã tra cứu dạng `SLC-ACC-YYMMDD-XXXX`.
- Tra cứu yêu cầu bằng mã + email, lấy trạng thái thật từ backend.
- Email kích hoạt tài khoản dùng cùng design system email.
- Email log lưu ở D1 với cơ chế fail-safe, không làm hỏng quy trình chính nếu bảng log chưa tồn tại.
- Giao diện public bổ sung nội dung giới thiệu dài về lớp học, học liệu, kiểm tra, bảo mật và hỗ trợ.


---

## Tài liệu lịch sử: UPGRADE-V8-WEB-FIRST.md

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


---

## Tài liệu lịch sử: UPGRADE-V9-SUPER-CENTER.md

# Nâng cấp V9 — SUPER CENTER

V9 đưa phần lớn tác vụ vận hành sang website/Admin: xét hồ sơ nhiều trạng thái, quản lý tài khoản nâng cao, tạo hàng loạt, cấp lại kích hoạt, force logout, tạo/lưu trữ lớp, rotate join code, thêm thành viên, CMS public, thông báo có lịch, chính sách, email template, export dữ liệu và session cleanup.

## Nâng từ V8

Không cần chạy `0005_admin_supercenter.sql` bằng tay nếu Super Admin có thể đăng nhập. Khi mở Control Center, frontend gọi `/api/admin/system/upgrade`; endpoint này áp dụng schema V9 idempotent bằng `CREATE TABLE IF NOT EXISTS` và `INSERT OR IGNORE`. File migration vẫn được giữ để dùng cho quy trình CI hoặc khôi phục chuẩn.

## Email template placeholders

Các template có thể dùng các placeholder phù hợp với từng loại email, ví dụ: `{{full_name}}`, `{{request_code}}`, `{{sfn_id}}`, `{{activation_url}}`, `{{status}}`, `{{note}}`. Nếu HTML template để trống, hệ thống dùng mẫu email mặc định đã thiết kế sẵn.


---

## Tài liệu lịch sử: UPGRADE-V10-HARDENING.md

# Nâng cấp V10 — HARDENED SUPER CENTER

## Các lỗi/lỗ hổng V9 đã xử lý

1. Bài tập và bài kiểm tra từng có endpoint đọc/khởi chạy chưa xác minh đầy đủ membership lớp.
2. Bài nộp có thể được gọi bằng ID mà chưa kiểm tra người dùng thuộc lớp tương ứng.
3. File bài nộp `private` không cho giáo viên/trợ giảng đọc để chấm.
4. Live WebSocket từng tin `name` và `role` do client tự gửi trong query string.
5. Exam Mode có thể khóa tài khoản lâu nếu phiên thi bị bỏ dở; reload chưa có đường resume chuẩn.
6. Nhiều activation link của cùng tài khoản có thể cùng còn hiệu lực.
7. File active-content (HTML/SVG/JS) có nguy cơ được render inline cùng origin.
8. Lỗi 500 chưa có request ID và chưa có bảng incident để truy vết.
9. Login chưa có throttle chống thử mật khẩu liên tục.
10. Tạo bài kiểm tra từ UI còn dùng câu hỏi mẫu, chưa phải trình soạn thật.

## Chức năng mới

- `login_throttle`
- `live_access_tokens`
- `class_messages`
- `class_events`
- `system_incidents`
- Secure live tokens + guest live link
- Exam resume + local recovery
- Web exam builder
- Assignment grading
- Class chat
- Class calendar
- System diagnostics
- Test-email action
- Unified cleanup

## Migration

Migration mới: `migrations/0006_v10_hardening.sql`.

Super Admin có thể nâng cấp bằng Control Center, không cần chạy SQL tay trong luồng vận hành bình thường.
