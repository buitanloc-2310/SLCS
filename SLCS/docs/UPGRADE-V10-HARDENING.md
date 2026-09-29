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
