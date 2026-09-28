# SLC architecture restructure

This build removes the previous "patch on top of patch" direction.

## Boundaries
- `src/vplus-platform.js`: platform schema, permissions and platform events only.
- `src/ai/service.js`: Sky First AI provider/config/auth/quota/research/safety/prompt logic.
- `public/ai/vplus-ai.js`: AI UI only.
- `public/classroom/*`: classroom/media/beauty only.
- `public/app.js`: application routing/screens and API client.
- `public/styles.css`: one consolidated stylesheet. The appended UI reconstruction override block was removed; the light Sky First tokens are now the base source values.

## AI configuration
The AI service accepts either `AI_API_KEY` or `OPENAI_API_KEY`. Model may be set by `AI_MODEL` or `OPENAI_MODEL`. No secret is stored in this ZIP.

For Cloudflare production, set the secret before deployment, for example `AI_API_KEY`, then use the existing AI provider test endpoint/admin diagnostic to verify runtime connectivity.
