# Triển khai Cloudflare — SLCS Production

## 1. Kiểm tra source

```bash
npm run validate:production
```

Không deploy nếu cổng kiểm tra thất bại.

## 2. Kiểm tra binding

Đảm bảo `wrangler.json` trỏ đúng Pages project, D1 database, R2/Realtime và các secret cần thiết cho môi trường thật. Không đưa secret vào repository hoặc file public.

## 3. Migration D1

```bash
npm run db:migrate
```

Runtime cũng có cơ chế phát hiện schema cũ/thiếu và repair bằng bộ migration hợp nhất, nhưng migration chủ động trước deploy vẫn là đường triển khai chuẩn.

## 4. Deploy Pages

```bash
npm run deploy
```

Hoặc chạy toàn bộ chuỗi:

```bash
npm run deploy:production
```

## 5. Smoke test sau deploy

Kiểm tra ít nhất các luồng sau trên domain thật:

1. Public Home → Login.
2. Login → Dashboard → Classes → một Class Detail.
3. Tất cả tab lớp: Bảng tin, Học liệu, Bài tập, Đánh giá, Sổ điểm, Điểm danh, Tiến độ, Chat, Lịch, Thành viên.
4. Assessment Center: mở bài, autosave, nộp; strict mode nếu áp dụng.
5. Live Classroom trên ít nhất hai thiết bị: cấp quyền mic/camera, đổi thiết bị, mute/unmute, bật/tắt camera, chia sẻ màn hình, rời/vào lại phòng.
6. Admin, Website Studio, Operations Center và quyền theo role.

Nếu một API phụ thất bại, UI phải cô lập lỗi ở component tương ứng thay vì làm sập toàn bộ authenticated shell.
