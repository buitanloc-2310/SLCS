# SLCS V40 Production Final

Bản này được đóng từ V39 sau vòng hardening cuối, không cắt giảm capability của Learning Core, Assessment Center, Live Classroom, Website Studio, IAM/Organization/Automation/Analytics hay Control Center.

## Các sửa lỗi/hardening cuối
- Giữ `safeHttpUrl()` ở runtime chính và kiểm tra whitelist `http/https`.
- Sửa lỗi runtime Control Center do API collection có thể thiếu trường mảng; các danh sách quan trọng được normalize trước `map/slice/filter`.
- `admin-operations` dùng đúng Admin UI area.
- Cache-bust asset V40.
- Thêm Origin guard cho request thay đổi dữ liệu từ trình duyệt.
- Bổ sung HSTS cho static và API response.
- PBKDF2 mới dùng 210.000 vòng; tài khoản dùng hash cũ vẫn đăng nhập được và được nâng cấp sau đăng nhập thành công.
- Mã lớp và mật khẩu tạm dùng `crypto.getRandomValues()`.
- Log debug media bị tắt mặc định, chỉ bật khi `globalThis.__SLC_DEBUG__ === true`.
- Email hệ thống đổi về bảng màu Sky First xanh/trắng.
- Xóa asset/template tĩnh không được runtime sử dụng để giảm gói production.
- AI/assistant public/API không được tái đưa vào.

## Release gate đã chạy trong môi trường build
- Toàn chuỗi validator VPLUS -> P0/P1/P2 -> V33 -> V39 -> V40: PASS.
- V40 Production gate: 16/16 PASS.
- 22 migration chạy tuần tự trên SQLite sạch: PASS.
- Headless Chromium smoke với API mock: public routes, authenticated shell, Control Center, Organization, Operations, Class tabs, School Studio, Assessment shell thường/nghiêm ngặt: không có page error.
- Desktop 1440px và mobile 390px smoke: không phát hiện horizontal overflow; logo/header không phình vượt layout.
- ZIP integrity phải được kiểm tra lại sau khi đóng gói.

## Trước khi deploy Cloudflare
Thiết lập secret ở môi trường Cloudflare, không ghi vào source: `SETUP_TOKEN`, `RESEND_API_KEY`, `REALTIME_APP_ID`, `REALTIME_APP_SECRET` (các secret realtime cần khi dùng SFU). Sau đó chạy migration remote và deploy Pages.

Các smoke test ở trên kiểm tra source/render trong build environment; chúng không thay thế test hạ tầng Cloudflare/D1/R2/Realtime thật sau deploy.
