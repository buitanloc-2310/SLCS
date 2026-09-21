# Lưu ý cho V10 Pages Edition

Bản phát hành này chạy API chính bằng Cloudflare Pages Functions. Các nội dung Worker-first bên dưới được giữ làm tài liệu kiến trúc lịch sử. Với triển khai hiện tại, ưu tiên `PAGES-SETUP.md` và `DEPLOY-CLOUDFLARE.md`.

# Kiến trúc SLC

## Identity
Tài khoản SFN là danh tính duy nhất. SLC không có đăng ký user tự do. Người chưa có tài khoản phải gửi Account Request, được admin duyệt, nhận SFN ID rồi kích hoạt.

## Storage
- D1: relational metadata.
- R2: binary objects.
- Durable Object: realtime signaling.
- Browser local state: autosave exam giữa các lần sync.

## Live Classroom
`LIVE_ROOM` là Durable Object theo tên class/room. Client sử dụng WebSocket signaling và native WebRTC.

## Exam Mode
Khi `exam_attempts.status = in_progress`, API middleware chặn phần lớn API khác của user bằng HTTP 423. Các endpoint save/submit của attempt vẫn được phép.

## Document -> Quiz
PDF text extraction chạy ở browser bằng PDF.js. Text được gửi lên `/api/quiz/generate` để tạo draft heuristic. Draft luôn cần giáo viên kiểm tra trước khi xuất bản.
