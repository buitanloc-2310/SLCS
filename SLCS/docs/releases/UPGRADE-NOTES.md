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
Cloudflare Pages không tự tạo Durable Object trong project Pages. Để media giữa nhiều người hoạt động qua WebRTC signaling, cần bind `LIVE_ROOM` hoặc `LIVE_SERVICE`. Khi chưa bind, phòng vẫn dùng được camera/micro cục bộ và chat HTTPS cho thành viên lớp.

## Baseline bảo toàn
PBKDF2 giữ nguyên `iterations: 10000` theo source người dùng cung cấp.
