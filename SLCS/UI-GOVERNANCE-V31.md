# V31 — UI Governance / Website Editor

V31 bắt đầu giai đoạn kiện toàn giao diện trước khi mở rộng chức năng.

## Nguồn giao diện duy nhất
Màu sắc và hình thức dùng chung được điều khiển từ Quản trị > Website. `auth-shell.css` là lớp design-system cuối cùng; trang con chỉ định nghĩa cấu trúc, không được tạo theme riêng cho shell.

## Admin có thể chỉnh trực tiếp
- Màu chính, màu chính đậm, nền website, nền thẻ, chữ chính, chữ phụ.
- Màu đường viền, nền phụ, màu cảnh báo.
- Bo góc thẻ, bo góc nút, bo góc ô nhập.
- Chiều rộng nội dung tối đa, tỷ lệ cỡ chữ, độ đậm bóng.
- Header gọn/rộng, footer sau đăng nhập hiện/ẩn, giảm chuyển động.
- Nhận diện, nội dung trang chủ, footer, liên hệ, quyền truy cập, maintenance và thông báo công khai.

School Admin được phép lưu nhóm cấu hình website/an toàn; các cấu hình hệ thống nhạy cảm vẫn dành cho Super Admin.

## Quy tắc màu
Mặc định: nền xanh trời nhạt, surface trắng, chữ đen, màu chính xanh Sky First. Public và authenticated shell dùng cùng biến CSS. Website Editor giữ palette quản trị trung tính cố định để Admin luôn đọc được kể cả khi đang thử màu xấu.

## Kiểm tra V31
- JavaScript syntax: PASS.
- Chuỗi validator hiện có: PASS, Feature Preservation 24/24, P2.4 14/14.
- Cache bust asset: v31.0.0.
- Chưa tuyên bố production/browser E2E PASS vì không có phiên đăng nhập production/D1 trong môi trường build. Cần deploy staging và kiểm tra route thật trước khi chốt "kiện toàn".
