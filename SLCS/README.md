# SLCS — Trung tâm Học tập Số Sky First Network

Một Cloudflare Worker duy nhất phục vụ giao diện, API và realtime classroom.

## Cấu trúc triển khai

- `src/index.js`: Worker/API entrypoint.
- `src/live-room.js`: Durable Object realtime room.
- `public/`: static assets được Worker Assets phục vụ.
- `migrations/`: lịch sử D1, không reset/xóa khi deploy.
- D1 binding: `DB`.
- R2 binding: `FILES`.
- Durable Object binding: `LIVE_ROOM`.

Không cần Worker realtime thứ hai và không dùng `LIVE_SERVICE`.

## Kiểm tra

```bash
npm install
npm run check
npm run test:core
```

## Deploy

```bash
npm run deploy
```

Cloudflare Workers Builds có thể nối trực tiếp repository và dùng deploy command `npm run deploy`. Root directory của repository dạng lồng là `SLCS`.

Secrets như API key phải cấu hình bằng Cloudflare Secrets/Variables, không commit vào source.

## Triển khai Cloudflare — một Worker duy nhất

Dự án này dùng **Cloudflare Worker + Static Assets + D1 + R2 + Durable Object `LIVE_ROOM`** trong cùng một deployment. Không dùng Pages Functions, không dùng `LIVE_SERVICE`, và không cần Worker `sfn-slc-live`.

Cloudflare Workers Builds: Build command `npm run check`; Deploy command `npx wrangler deploy`. Root directory: `SLCS`.

