# Nâng cấp V9 — SUPER CENTER

V9 đưa phần lớn tác vụ vận hành sang website/Admin: xét hồ sơ nhiều trạng thái, quản lý tài khoản nâng cao, tạo hàng loạt, cấp lại kích hoạt, force logout, tạo/lưu trữ lớp, rotate join code, thêm thành viên, CMS public, thông báo có lịch, chính sách, email template, export dữ liệu và session cleanup.

## Nâng từ V8

Không cần chạy `0005_admin_supercenter.sql` bằng tay nếu Super Admin có thể đăng nhập. Khi mở Control Center, frontend gọi `/api/admin/system/upgrade`; endpoint này áp dụng schema V9 idempotent bằng `CREATE TABLE IF NOT EXISTS` và `INSERT OR IGNORE`. File migration vẫn được giữ để dùng cho quy trình CI hoặc khôi phục chuẩn.

## Email template placeholders

Các template có thể dùng các placeholder phù hợp với từng loại email, ví dụ: `{{full_name}}`, `{{request_code}}`, `{{sfn_id}}`, `{{activation_url}}`, `{{status}}`, `{{note}}`. Nếu HTML template để trống, hệ thống dùng mẫu email mặc định đã thiết kế sẵn.
