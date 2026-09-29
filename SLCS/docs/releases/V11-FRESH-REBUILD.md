# V11 Fresh Pages Rebuild

Đây là nhánh cài đặt mới, không tái sử dụng installer `DB.exec()` của V10.x.

## Installer D1 mới

- Nguồn schema được biên dịch thành `src/schema-v11.js`.
- Tổng cộng 6 stage / 60 câu SQL hoàn chỉnh.
- Mỗi câu được chạy riêng bằng `DB.prepare(sql).run()`.
- Không dùng `DB.exec()` trong installer hoặc Control Center upgrade.
- Không chạy `PRAGMA foreign_keys`.
- Có thể chạy lại an toàn vì schema dùng `IF NOT EXISTS` và seed dùng `INSERT OR IGNORE`.
- Khi lỗi, API trả stage, số thứ tự câu lệnh và phần SQL gây lỗi.

## Kiểm tra deployment

Mở `/api/health`. Bản đúng phải trả `version: V11 Fresh Pages Rebuild`.

Mở `/api/setup/installer-info`. Bản đúng phải trả:

- `engine: V11_ONE_STATEMENT_ENGINE`
- `uses_db_exec: false`
- `uses_pragma_foreign_keys: false`
- `total_statements: 60`

## Cloudflare Pages

- Framework preset: None
- Build command: `npm install && npm run check`
- Build output directory: `public`
- Root directory: `SFN-SLC-VIPPRO`

Bindings Production: `DB`, `FILES`; secrets: `SETUP_TOKEN`, `RESEND_API_KEY`.
