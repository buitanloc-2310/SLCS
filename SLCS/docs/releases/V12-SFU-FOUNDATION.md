# Sky First School V12 — SFU Foundation

## Đã nâng cấp

- Thêm Cloudflare Realtime SFU adapter cho Realtime App `skyfirsthoc`.
- App Secret chỉ được sử dụng server-side; frontend không nhận secret.
- Session/track được kiểm tra theo live access token và class trước khi proxy sang Cloudflare.
- D1 chỉ lưu metadata session/track, không lưu media.
- Durable Object vẫn quản lý presence/chat/reaction và phát discovery event track.
- SFU mode có room capacity riêng; WebRTC mesh vẫn là fallback an toàn khi chưa cấu hình secret.
- Frontend có `SkySfuClient`: publish, subscribe, renegotiate, replaceTrack, reconnect-compatible foundation.
- Room UI mặc định chuyển sang theme sáng kiểu School; vẫn có nút dark mode.
- Thêm Grid / Speaker / Compact layout.
- Hiển thị badge transport SFU/mesh để dễ chẩn đoán.

## Cấu hình cần thêm trên Cloudflare Pages `slc`

`REALTIME_APP_ID` và `REALTIME_APP_SECRET`. Không đặt secret vào source code.

## Chưa bật giả tính năng

V12 Foundation chưa tuyên bố recording, background segmentation, breakout room hay 500 camera đã được load-tested. Các module đó sẽ được xây trên SFU core sau khi kết nối production `skyfirsthoc` được xác nhận.
