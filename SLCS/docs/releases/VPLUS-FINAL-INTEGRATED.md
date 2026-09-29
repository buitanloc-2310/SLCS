# Sky First School VPLUS · VIP PRO — Final Integrated Build

Release focus: production-oriented integration, AI reliability and perceived latency, frontend request coalescing, static asset optimization, lazy QR/AI loading, classroom background polling reduction, role-safe error presentation, and release validation.

## AI
- OpenAI Responses adapter with transient retry.
- Research gracefully retries without the provider web-search tool when that tool is unavailable instead of failing the whole AI request.
- Provider/auth/quota details remain visible only in System Admin diagnostics.
- Non-admin users receive natural-language errors only.

## Performance
- 2000px PNG is no longer loaded in normal UI; a compact WebP UI asset is used.
- QRCode dependency is loaded only when QR is requested.
- AI implementation is loaded only when the user opens AI.
- Concurrent duplicate GET calls are coalesced; stable bootstrap data receives short safe client caching.
- Static assets use Pages cache headers.
- SFU discovery work pauses while the page is hidden and runs less aggressively.

This build still cannot guarantee zero production defects across every browser/network/provider. Release validation is intended to catch known structural, syntax, schema and packaging failures before deployment.
