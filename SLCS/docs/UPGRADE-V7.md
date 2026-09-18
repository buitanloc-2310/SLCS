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
