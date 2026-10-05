# SLCS — bản nâng cấp 05/10/2026

Bản này giữ các chức năng tài khoản, học tập, đánh giá, Website Studio và vận hành; giao diện được đồng nhất và sửa các lỗi phiên đăng nhập, thời gian thi, bộ nhớ đệm và biểu mẫu.

Cổng kiểm tra: `npm run validate:all` (Node.js >=22.13). Build production: `npm run build`.

Mật khẩu dùng PBKDF2 v3 với 100.000 vòng và hỗ trợ nâng cấp hash cũ khi đăng nhập. Cookie có HttpOnly, Secure, SameSite=Lax. Thời hạn UTC của SQLite và ISO được chuẩn hóa khi kiểm tra. Phúc khảo phải thuộc tổ chức đang chọn.

Phòng học video/WebRTC không còn runtime trong bản này. Asset cũ đã được dọn; quyền camera/microphone/display capture vẫn bị chặn. Hệ thống dự thi riêng vẫn dùng `EXAM_URL` đã cấu hình.

Không có thay đổi migration trong bản nâng cấp này; giữ nguyên 29 migration và installer hiện có. Cấu hình D1/R2 và secret phải được xác nhận ở môi trường triển khai.

Xem `docs/UPGRADE-2026-10-05.md` và `DEPLOY-CLOUDFLARE.md` để đối chiếu thay đổi và phạm vi kiểm tra.
