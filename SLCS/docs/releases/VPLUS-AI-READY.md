# Sky First School VPLUS — AI READY + Performance Pass

## Sky First Network AI

VPLUS now supports OpenAI Responses API directly through a provider adapter while retaining an OpenAI-compatible fallback path.

Default non-secret configuration in `wrangler.json`:

- `AI_PROVIDER=openai_responses`
- `AI_API_URL=https://api.openai.com/v1/responses`
- `AI_MODEL=gpt-5.6-luna`
- `AI_TIMEOUT_MS=30000`
- `AI_ENABLE_WEB_SEARCH=1`

Only the API key must be configured as a Cloudflare secret:

```bash
npx wrangler pages secret put AI_API_KEY --project-name slc
```

Do not place the API key in `wrangler.json`, public JavaScript, D1, or GitHub.

System Admin has an AI Center inside the System tab with safe provider/model status and a real provider test. Raw provider diagnostics remain System Admin only.

Research mode can use OpenAI's built-in web search when enabled. External research adapters (`AI_RESEARCH_URL`) remain optional.

## Performance pass

- AI JavaScript is lazy-loaded only after an authenticated session needs it.
- Classroom/media modules are lazy-loaded only when entering a live classroom.
- Control Center independent reads are parallelized.
- Automatic schema-upgrade POST on every System Admin page load was removed.
- HTTP chat polling is now a 15-second fallback only when WebSocket is unavailable and the page is visible.
- Browser API calls use timeouts so stalled requests do not leave UI actions hanging forever.
- AI capability results are cached in session storage for five minutes.

## Release note

This package can be validated with:

```bash
npm run validate:vplus
```

A live AI provider test still requires a real `AI_API_KEY` in the deployed Cloudflare environment.
