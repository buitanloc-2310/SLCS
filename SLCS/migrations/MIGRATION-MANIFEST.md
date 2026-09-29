# D1 migration compatibility manifest

Thư mục này là lịch sử schema canonical của SLCS production.

## Quy tắc bắt buộc

- Không đổi tên, sửa lại thứ tự hoặc xóa migration đã từng phát hành.
- Ba migration legacy có cùng prefix `0007_` được giữ nguyên vì D1/Wrangler có thể đã ghi nhận chính xác tên file ở môi trường production.
- Migration mới phải dùng prefix số mới tăng dần, không tái sử dụng prefix hiện có ngoài nhóm legacy `0007_`.
- `scripts/validate-production.mjs` kiểm tra số lượng migration canonical và xác nhận installer hợp nhất có chứa toàn bộ lịch sử này.
- Trước deploy production chạy `npm run validate:production`, sau đó `npm run db:migrate`.

Runtime có cơ chế kiểm tra schema đại diện và repair database cũ/thiếu bằng installer hợp nhất, nhưng đây là lớp phục hồi; đường triển khai chuẩn vẫn là Wrangler migrations trước khi deploy.
