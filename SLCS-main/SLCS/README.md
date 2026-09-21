## Sky First School VPLUS — VIP PRO

> **Current platform:** Sky First School VPLUS — Classroom UX + Confidence Camera + Teaching Layer + School Studio + Scale/Resilience.

# Trung tâm Học tập Số Sky First Network — V11 Pages Fresh Rebuild

V11 sử dụng installer D1 mới hoàn toàn theo cơ chế **one statement at a time** dành cho Cloudflare Pages Functions. Không còn dùng installer `DB.exec()` của V10.x.

- Public website + SFN account
- Account request / tracking / activation email
- Classes, materials, assignments, exams, support
- Admin Control Center
- D1 metadata + R2 files
- Giới hạn tối đa 10.000 tài khoản SFN
- Cài schema trực tiếp từ website bằng `SETUP_TOKEN`

## Deploy Pages

```text
Framework preset: None
Build command: npm install && npm run check
Build output directory: public
Root directory: SFN-SLC-VIPPRO
```

Sau deploy, kiểm tra `/api/health` và `/api/setup/installer-info` trước khi bấm cài dữ liệu.

Xem `V11-FRESH-REBUILD.md` để biết cơ chế installer mới.



## V12 — Cloudflare Realtime SFU `skyfirsthoc`

Bản V12 giữ Durable Object/WebSocket cho presence, chat và điều khiển lớp; camera/micro/screen có thể chuyển sang Cloudflare Realtime SFU.

Trong **Pages project `slc` > Settings > Variables and Secrets**, cấu hình:

- `REALTIME_APP_ID`: App ID của Realtime App `skyfirsthoc`.
- `REALTIME_APP_SECRET`: App Secret của Realtime App `skyfirsthoc` (**Secret**, không commit vào GitHub).

`REALTIME_API_BASE=https://rtc.live.cloudflare.com/v1` và `REALTIME_APP_NAME=skyfirsthoc` đã có trong cấu hình. Khi thiếu App ID/Secret, phòng học tự dùng WebRTC mesh dự phòng; khi đủ hai giá trị, frontend chuyển media sang SFU.

Migration mới: `0008_realtime_sfu_foundation.sql`. Migration này chỉ tạo bảng mới, không xóa dữ liệu cũ.
