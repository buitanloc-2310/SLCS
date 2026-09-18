# Cloudflare Pages deployment — SLC V10 Pages Edition

## Màn Build configuration

```text
Framework preset: None
Build command: npm install && npm run check
Build output directory: public
Root directory: SFN-SLC-VIPPRO
```

Bản Pages Edition có thư mục `/functions`, vì vậy Cloudflare sẽ tự deploy Pages Functions cùng site public.

## Sau khi deploy

1. Kiểm tra `/api/health` phải trả JSON.
2. Kiểm tra `/api/setup/status`.
3. Đặt secret `SETUP_TOKEN`.
4. Đặt `RESEND_API_KEY` nếu dùng email.
5. Mở website và chạy khởi tạo lần đầu.

D1 và R2 đã được khai báo trong `wrangler.json` với binding `DB` và `FILES`.

Riêng realtime WebSocket cần Durable Object external binding theo giới hạn của Cloudflare Pages.


## V12 — Cloudflare Realtime SFU `skyfirsthoc`

Bản V12 giữ Durable Object/WebSocket cho presence, chat và điều khiển lớp; camera/micro/screen có thể chuyển sang Cloudflare Realtime SFU.

Trong **Pages project `slc` > Settings > Variables and Secrets**, cấu hình:

- `REALTIME_APP_ID`: App ID của Realtime App `skyfirsthoc`.
- `REALTIME_APP_SECRET`: App Secret của Realtime App `skyfirsthoc` (**Secret**, không commit vào GitHub).

`REALTIME_API_BASE=https://rtc.live.cloudflare.com/v1` và `REALTIME_APP_NAME=skyfirsthoc` đã có trong cấu hình. Khi thiếu App ID/Secret, phòng học tự dùng WebRTC mesh dự phòng; khi đủ hai giá trị, frontend chuyển media sang SFU.

Migration mới: `0008_realtime_sfu_foundation.sql`. Migration này chỉ tạo bảng mới, không xóa dữ liệu cũ.
