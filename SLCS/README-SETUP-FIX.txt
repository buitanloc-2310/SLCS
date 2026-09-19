SFN-SLC-VIPPRO — Production Rebuild

Bản này sửa toàn diện quy trình setup/bootstrap:
- Chuẩn hóa SETUP_TOKEN (trim + loại BOM) ở cả frontend/backend.
- Gửi token bằng cả header và JSON body dự phòng.
- So sánh token an toàn hơn; nếu mismatch hiển thị độ dài + fingerprint SHA-256 rút gọn, không lộ secret.
- Setup routes chạy trước session preflight.
- Installer D1 dùng engine one-statement, không dùng DB.exec/PRAGMA.
- Bootstrap Super Admin có stage diagnostic và rollback counter khi tạo user thất bại.
- Giới hạn tài khoản giữ nguyên 10.000.

Tên thư mục gốc bắt buộc: SFN-SLC-VIPPRO/
