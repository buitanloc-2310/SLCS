# Sky First School VPLUS — VIP PRO


## Nguyên tắc phát hành
- Không hiển thị D1, R2, Worker, Durable Object, SFU, transport, binding, schema, log hoặc lỗi kỹ thuật cho người dùng thường.
- Hạ tầng và chẩn đoán chuyên sâu chỉ thuộc System Admin.
- Lỗi người dùng được chuyển thành thông báo tự nhiên; chi tiết kỹ thuật chỉ ghi ở phía máy chủ/audit phù hợp.
- Media endpoint phía trình duyệt dùng tên trung tính `/api/live/media/*`.

Để bật model thật, cấu hình Secrets/Variables cho Worker/Pages:

Research Mode có thể nối thêm một dịch vụ tìm kiếm do bạn lựa chọn:


## Realtime media
Realtime media tiếp tục dùng cấu hình phía máy chủ của ứng dụng `skyfirsthoc`. Secret của media chỉ lưu ở Cloudflare Secrets và không xuất hiện trong mã frontend hay response thông thường.

## D1
Migration VPLUS: `migrations/0010_vplus_foundation.sql`.
Runtime cũng có `ensureVPlusSchema()` dùng `CREATE TABLE IF NOT EXISTS` cho các bảng VPLUS để giảm rủi ro rollout thiếu schema.

## VPLUS Foundation đã tích hợp
- User-safe Error Gateway.
- Analytics/event foundation.
- Multi-tenant foundation: organization, membership, domain, settings, usage metering.
- Ẩn thuật ngữ media/hạ tầng khỏi classroom UI và API trạng thái thông thường.
- System Admin giữ diagnostics chuyên sâu; tài khoản khác không có tab/pane hạ tầng.

## Kiểm tra trước phát hành
Chạy:

```bash
npm run validate:vplus
```

Lệnh này gồm syntax check và audit các đường dẫn cũ, public secret identifiers, gating System Admin và import tĩnh.
