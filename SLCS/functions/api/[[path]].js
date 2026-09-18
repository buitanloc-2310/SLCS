// Cloudflare Pages compatibility entrypoint.
// The product can be deployed as a Worker with Assets or through the legacy
// Pages project. Both entrypoints execute the exact same API implementation.
import { handleApiRequest } from '../../src/index.js';

export async function onRequest(context) {
  return handleApiRequest(context.request, context.env, context);
}
