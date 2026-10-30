import { createListeningHandler } from "./spotify.mjs";

const handlers = new WeakMap();
export default {
  async fetch(request, env, context) {
    if (new URL(request.url).pathname !== "/api/listening") return env.ASSETS.fetch(request);
    if (!env.SPOTIFY_STORE) return createListeningHandler(null)(request);
    if (!handlers.has(env.SPOTIFY_STORE)) handlers.set(env.SPOTIFY_STORE, createListeningHandler(env.SPOTIFY_STORE));
    const cache = globalThis.caches?.default;
    const key = new Request(`${new URL(request.url).origin}/api/listening`);
    if (cache && ["GET", "HEAD"].includes(request.method)) {
      const hit = await cache.match(key);
      if (hit) return request.method === "HEAD" ? new Response(null, hit) : hit;
    }
    const response = await handlers.get(env.SPOTIFY_STORE)(request);
    if (cache && response.ok && request.method === "GET") context.waitUntil(cache.put(key, response.clone()));
    return response;
  },
};
