# P0 HARDENING REPORT — Sky First SLC

## Phạm vi
Bản này xử lý nhóm P0 đã xác định sau khi rà lại source P1 và đối chiếu tài liệu Cloudflare/MDN.

## Sửa trực tiếp
1. Join/deep-link: link khách mới dùng `/join.html?class=...`, là URL HTTP thật thay vì phụ thuộc trực tiếp vào fragment hash khi mở từ app khác.
2. Fresh join token: access token chỉ được cấp sau khi người dùng hoàn tất pre-join và bấm Tham gia.
3. Reconnect auth: khi WebSocket đóng với nhóm mã xác thực/quyền, client thử cấp token mới trước khi nối lại.
4. Realtime binding: Pages được cấu hình `LIVE_SERVICE -> sfn-slc-live`; Worker realtime/DO được deploy riêng theo đúng mô hình Cloudflare Pages không tự triển khai DO trong Pages.
5. WebSocket diagnostics: bỏ `ws.onerror=()=>{}`; UI báo trạng thái gián đoạn/khôi phục.
6. Media capability: pre-join kiểm tra secure context + mediaDevices; WebView/in-app browser không hỗ trợ vẫn được phép vào lớp ở chế độ không camera/mic và nhận hướng dẫn mở Chrome/Safari.
7. Resource URL: endpoint thêm tài nguyên lớp chỉ nhận `http://` hoặc `https://`.
8. Deploy pipeline: thêm `npm run deploy:live` và `npm run deploy:p0` để deploy realtime Worker trước Pages.

## P0 cần xác minh trên production
Static/local validation không thể chứng minh: quyền camera/mic của Zalo/Facebook/TikTok WebView; ICE/NAT giữa hai mạng thật; Cloudflare service binding trên tài khoản; secret realtime; SFU production; screen sharing trên từng browser. Sau deploy phải chạy ma trận E2E thật.
