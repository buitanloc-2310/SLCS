# SLCS Production Release

Đây là bản production hợp nhất. Tên release bên ngoài không mang số phiên bản; các tên migration lịch sử vẫn được giữ để tương thích database.

## Phạm vi chức năng

- Public site, login, account request/activation và chính sách.
- Dashboard theo tài khoản, lớp học và thành viên.
- Learning Core: học liệu, bài tập, nộp bài, chấm điểm, sổ điểm, điểm danh, tiến độ.
- Assessment Center đa mục đích: thi, kiểm tra, đánh giá, sát hạch, tuyển chọn, cuộc thi, khảo sát và cấu hình tùy chỉnh.
- Live Classroom: prejoin, mic/camera, chọn thiết bị, screen share, realtime/SFU fallback và recovery.
- Website Studio: chỉnh nội dung/branding, draft, preview, publish và revision history.
- IAM, organization, automation, analytics và Operations Center.

## Hardening chính

- Chuẩn hóa dữ liệu tài khoản và API boundary để chịu được `null`, object/array thiếu field và dữ liệu cũ.
- Authenticated shell không phụ thuộc vào `full_name` luôn là chuỗi.
- Các API phụ ở lớp/Assessment/Admin/Support được cô lập lỗi; một component lỗi không được làm sập toàn bộ ứng dụng.
- Runtime kiểm tra/repair schema trước các API xác thực để giảm lỗi do database production cũ hoặc chưa đủ migration.
- Assessment không gửi đáp án đúng xuống client trước khi nộp.
- Strict exam gửi sự kiện rời trang bằng request `keepalive`.
- PBKDF2 hiện dùng 10.000 vòng theo yêu cầu của dự án.
- Camera/microphone/display capture được khai báo trong Permissions Policy.
- Không có runtime AI; migration DROP legacy AI tables được giữ để dọn dữ liệu cũ an toàn.

## Release gate

Cổng chính:

```bash
npm run validate:production
```

Ngoài cổng tĩnh, trước khi đóng gói production cần chạy audit API/schema/SQL/browser/media/realtime trong bộ kiểm thử phát triển. Sau khi deploy vẫn phải smoke test domain Cloudflare và thiết bị mic/camera thật vì môi trường local không thể chứng minh binding/D1/R2/SFU/permission của production bên ngoài.
