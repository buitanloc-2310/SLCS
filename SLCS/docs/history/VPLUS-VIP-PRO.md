# Sky First School VPLUS — VIP PRO

VPLUS hợp nhất nền tảng lớp học hiện tại thành một nhánh sản phẩm duy nhất và bổ sung nền tảng cho phân quyền, analytics, AI, multi-tenant và khả năng mở rộng.

## Nguyên tắc phát hành
- Không hiển thị D1, R2, Worker, Durable Object, SFU, transport, binding, schema, log hoặc lỗi kỹ thuật cho người dùng thường.
- Hạ tầng và chẩn đoán chuyên sâu chỉ thuộc System Admin.
- Lỗi người dùng được chuyển thành thông báo tự nhiên; chi tiết kỹ thuật chỉ ghi ở phía máy chủ/audit phù hợp.
- Media endpoint phía trình duyệt dùng tên trung tính `/api/live/media/*`.
- Sky First AI luôn tuân theo quyền người dùng và không được vượt quyền chỉ vì là AI.
- Hành động AI có ảnh hưởng tới lớp cần kiểm tra quyền; các hành động quan trọng dùng bước xác nhận.

## Sky First Network AI
Để bật model thật, cấu hình Secrets/Variables cho Worker/Pages:
- `AI_API_URL`: endpoint chat-completions tương thích mà bạn lựa chọn.
- `AI_API_KEY`: Secret, tuyệt đối không đưa vào frontend.
- `AI_MODEL`: tên model triển khai.

Research Mode có thể nối thêm một dịch vụ tìm kiếm do bạn lựa chọn:
- `AI_RESEARCH_URL`: endpoint tìm kiếm của nhà cung cấp/adapter riêng.
- `AI_RESEARCH_API_KEY`: Secret nếu endpoint cần xác thực.

Nếu chưa cấu hình AI hoặc Research provider, hệ thống trả thông báo tự nhiên và không giả vờ đã truy cập web.

## Realtime media
Realtime media tiếp tục dùng cấu hình phía máy chủ của ứng dụng `skyfirsthoc`. Secret của media chỉ lưu ở Cloudflare Secrets và không xuất hiện trong mã frontend hay response thông thường.

## D1
Migration VPLUS: `migrations/0010_vplus_foundation.sql`.
Runtime cũng có `ensureVPlusSchema()` dùng `CREATE TABLE IF NOT EXISTS` cho các bảng VPLUS để giảm rủi ro rollout thiếu schema.

## VPLUS Foundation đã tích hợp
- Role-aware Permission Engine cho AI và action.
- User-safe Error Gateway.
- Analytics/event foundation.
- AI audit + action confirmation + rate limit.
- Sky First AI: Ask / Research / Create / Analyze / Act theo quyền.
- Provider-agnostic AI gateway.
- Multi-tenant foundation: organization, membership, domain, settings, usage metering.
- Ẩn thuật ngữ media/hạ tầng khỏi classroom UI và API trạng thái thông thường.
- System Admin giữ diagnostics chuyên sâu; tài khoản khác không có tab/pane hạ tầng.

## Kiểm tra trước phát hành
Chạy:

```bash
npm run validate:vplus
```

Lệnh này gồm syntax check và audit các đường dẫn cũ, public secret identifiers, gating System Admin và import tĩnh.
