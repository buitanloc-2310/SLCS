# Sky First School V13

V13 hợp nhất các phase V12.1–V12.5 thành một bản nâng cấp lớn trên cấu trúc SLC hiện có.

## Classroom UX
- Prejoin camera/micro preview + device selector.
- Waiting Room thật ở Durable Object: học viên chưa được admit không vào roster/control channel của lớp.
- Layout Auto/Grid/Speaker/Presentation/Compact.
- Teacher Control: admit, mute, camera off, hand queue, timer.
- School Studio theo lớp, lưu trực tiếp D1.

## Confidence Camera
- Camera preview trước khi vào lớp.
- Self-view filter: Natural/Bright/Warm/Soft/Mono, Soft Light, mirror, hide self-view.
- Privacy blur toàn khung và Panic Hide.
- Không giả background segmentation: nếu cần tách người/nền thật sẽ bổ sung processor/model riêng sau; V13 không gắn nhãn giả cho hiệu ứng không có.

## Teaching Layer
- Anonymous Classroom Pulse: hiểu / hơi rối / mất bài / giải lại.
- Whisper to Teacher và Ask Later.
- Poll realtime + lưu đáp án D1.
- Shared timer.
- Live resources.
- Attendance join/heartbeat/leave.
- Catch Me Up dựa trên event journal của phòng.

## School Studio
- Theme preset: Sky/Ocean/Lavender/Mint/Sunrise/Rose/Midnight.
- Accent/background/surface, default layout, max visible videos.
- Waiting room, mic/camera/screen-share, chat, reactions, adaptive video, confidence camera.
- School Admin có trang School Studio riêng từ Control Center; Teacher/Assistant chỉnh ngay trong phòng.
- System Admin được tách thành màn hình System Admin tập trung health/scale/schema/system limits.

## Scale / Resilience
- Mỗi lớp tiếp tục cô lập bằng Durable Object theo room key.
- Media qua Cloudflare Realtime SFU `skyfirsthoc`, không qua Worker/D1.
- Adaptive video subscription cap, ưu tiên teacher/assistant và screen share.
- WebSocket reconnect exponential backoff + jitter.
- SFU ICE recovery/renegotiation.
- Live metrics endpoint cho System Admin.
- Backend enforce quyền publish mic/camera/screen, không chỉ khóa ở UI.

## Cloudflare secrets
Giữ secret ở Worker/Pages Settings, không đưa vào frontend:
- REALTIME_APP_ID
- REALTIME_APP_SECRET

## D1
Migration mới: `migrations/0009_v13_school_platform.sql`.
Runtime cũng có `ensureV13Schema()` để các bảng V13 được tạo an toàn khi V13 endpoint/upgrade được gọi.
