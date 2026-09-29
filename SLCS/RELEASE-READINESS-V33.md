# SLCS V33 — Release Readiness

## Mục tiêu
Bản ứng viên phát hành sau V32, ưu tiên ổn định toàn hệ thống trước khi build/deploy production.

## Đã kiện toàn trong source
- Design system xanh nhạt / trắng / chữ đen dùng chung public + authenticated shell.
- Website Editor cho phép Super Admin / School Admin chỉnh nhận diện, header, màu, bố cục, nội dung trang chủ, footer, toàn bộ tên + URL liên kết hệ sinh thái, truy cập và thông báo.
- URL footer chỉ nằm trong href; giao diện chỉ hiển thị tên liên kết.
- Cache-busting assets nâng lên V33.
- Trung tâm Thi, Exam Builder, strict Exam Shell, fullscreen requirement, autosave, submit/terminate và Event Log giữ nguyên.
- Lớp học, thành viên, live room, calendar, resources, support, account, admin, organizations giữ nguyên.
- Không phục hồi trợ lý/AI đã loại khỏi sản phẩm.
- Màu tím legacy trong lớp học được thay bằng Sky blue.

## Release gate tự động
Chạy `npm run validate:release` trước mọi build/deploy.
Gate bao gồm toàn bộ validate:final và V33 release checks.

## Việc bắt buộc ở staging trước production
1. Apply D1 migrations trên staging và xác nhận không lỗi.
2. Đăng nhập bằng Student / Teacher / School Admin / Super Admin.
3. Mở lần lượt Home, Classes, Class detail, Exam Center, Calendar, Resources, Support, Account, Admin.
4. Kiểm tra Website Editor: đổi màu, header, footer link rồi refresh.
5. Test thêm/xóa thành viên lớp và xóa lớp thử nghiệm.
6. Test một kỳ thi strict fullscreen trên Chrome/Edge desktop thật.
7. Test Live Room trên ít nhất 2 thiết bị thật cho mic/camera/share/chat/reconnect.
8. Test email provider thật và email activation/reset.
9. Kiểm tra mobile 360–430px và desktop >=1280px.
10. Chỉ promote production sau khi các bước trên đạt.

Static validator không thay thế E2E staging/production.
