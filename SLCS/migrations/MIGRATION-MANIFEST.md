# D1 migration compatibility manifest

Các migration `0007_class_plus.sql`, `0007_classroom_experience.sql`, và `0007_live_runtime.sql` là lịch sử đã phát hành trước P2.
P2 **không đổi tên** ba file này vì Wrangler/D1 có thể đã ghi nhận tên migration ở production; đổi tên có thể khiến migration cũ bị coi là migration mới.

Quy tắc từ P2:
- Ba file `0007_*` được đóng băng, không sửa nội dung và không đổi tên.
- Migration mới phải dùng một prefix số duy nhất, tăng dần từ `0011_` trở đi.
- `scripts/validate-p2.mjs` sẽ fail nếu xuất hiện prefix trùng mới ngoài prefix legacy `0007`.
- Trước deploy production luôn chạy `npm run validate:p2` và kiểm tra `wrangler d1 migrations list sfn-slc-db --remote`.
