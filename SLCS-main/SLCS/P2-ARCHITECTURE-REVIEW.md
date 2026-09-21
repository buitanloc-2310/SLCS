# P2 Architecture Review — Sky First Digital Learning Center

## Mục tiêu
P2 tập trung dọn kiến trúc/build/deploy sau P0/P1 mà không làm thay đổi hành vi lớp học đã harden.

## Thay đổi đã thực hiện
1. Xóa `public/classroom/v13-classroom.js` vì không còn được import và là implementation legacy của `classroom-plus.js`.
2. Xóa `public/classroom/sfu-client.js`; runtime hiện chỉ import `media-client.js`, giúp còn một media client production.
3. Dọn tài liệu release cũ khỏi application root vào `docs/releases/` để root phản ánh các file vận hành hiện hành.
4. Giữ nguyên ba migration `0007_*` vì đây là migration lịch sử có thể đã được D1 production ghi nhận. Thay vì rename nguy hiểm, P2 đóng băng chúng và thêm migration manifest + validator ngăn prefix trùng mới.
5. Thêm `validate-config.mjs`: kiểm tra DB/R2/realtime service binding, HTTPS APP_URL và chống hard-code secret quan trọng.
6. Thêm `validate-p2.mjs`: kiểm tra single classroom/media implementation, migration policy và source-root hygiene.
7. Classroom `loadData()` không còn nuốt lỗi hoàn toàn: ghi warning và đưa trạng thái thân thiện tại khu tài nguyên.

## Cố ý không làm
- Không đổi tên migration đã phát hành chỉ để “đẹp số”, vì có thể gây replay/duplicate migration trên D1 production.
- Không xóa các catch dùng cho cleanup/best-effort (đóng stream, close socket, telemetry phụ), vì failure ở các đoạn đó không nên phá luồng chính.
- Không tuyên bố runtime production đã pass nếu chưa deploy và test browser thật.

## Lệnh kiểm tra
`npm run validate:p2`
