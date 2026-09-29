# SLCS V32 — Kiện toàn lõi & Trung tâm Thi

## Phạm vi đã hoàn thành trong source
- Giữ UI Governance V31: màu/nền/chữ/bo góc/bóng/header/footer do Admin cấu hình trên website.
- Giữ toàn bộ luồng public, account, class, resources, calendar, support, live classroom, admin và website editor.
- Thêm Trung tâm `Thi & Kiểm tra` ở điều hướng sau đăng nhập.
- Nâng Exam Builder: lịch mở/đóng, thời lượng, số lượt, công bố điểm, quy chế, strict mode, fullscreen, terminate-on-exit, MCQ/Đúng-Sai/Tự luận.
- Exam Shell tách khỏi shell SLC thường: ẩn điều hướng, đồng hồ, bản đồ câu, autosave/local recovery.
- Strict monitoring: yêu cầu Fullscreen; khi cấu hình nghiêm ngặt, `visibilitychange` hoặc thoát Fullscreen đóng attempt qua server, lưu đáp án cuối + event log + closed reason.
- Exam Monitor cho GV/TA/Admin: trạng thái đang thi/đã nộp/bị đóng và quyền mở lại attempt bị đóng/hết giờ.
- API Exam Center, monitor, violation, reopen; audit table và migration V32.
- Gỡ capability/config/schema tạo mới của trợ lý cũ; migration 0015 dùng để dọn các bảng legacy trên database đã triển khai.

## Giới hạn kỹ thuật cần hiểu đúng
Website có thể yêu cầu Fullscreen và phát hiện các sự kiện trình duyệt cho phép. Website không thể khóa tuyệt đối Alt+Tab/Home/Task Manager hoặc vô hiệu hệ điều hành như kiosk/managed-device software. V32 vì vậy xử lý nghiêm ở mức trình duyệt: phát hiện -> ghi log -> đóng attempt trên server.

## Kiểm tra
- `npm run validate:final`: PASS, Feature Preservation 24/24, P2.4 14/14.
- `node scripts/validate-v32-exam.mjs`: 12/12 PASS.
- `node --check`: PASS cho frontend/backend chính.

## Trước production
Phải áp dụng D1 migrations 0014 và 0015 trên môi trường staging trước. Static validation không thay thế kiểm thử đăng nhập, D1/R2, email, SFU và fullscreen trên trình duyệt/thiết bị thật.
