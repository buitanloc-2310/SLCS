import { handleApiRequest } from '../../src/index.js';

export async function onRequest(context) {
  return handleApiRequest(context.request, context.env, {
    waitUntil: (promise) => context.waitUntil(promise),
    passThroughOnException: () => context.passThroughOnException?.()
  });
}
