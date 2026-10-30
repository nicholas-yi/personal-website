export const SPOTIFY_OWNER = "21nln64qkjniyjcerq3vlx5pi";
export const SPOTIFY_SCOPES = ["user-read-currently-playing", "user-read-recently-played"];
const API = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const CACHE_SECONDS = 30;

class ListeningError extends Error {
  constructor(code, status = 503, retryAfter = CACHE_SECONDS) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeTrack(track, playedAt = null) {
  if (!track || track.is_local || track.type !== "track") return null;
  if (!text(track.name) || !Array.isArray(track.artists) || !track.artists.length ||
      !track.artists.every((artist) => text(artist.name)) || !text(track.album?.name)) {
    throw new ListeningError("invalid_response");
  }
  const url = new URL(track.external_urls?.spotify || "", "https://invalid.example");
  if (url.protocol !== "https:" || url.hostname !== "open.spotify.com" || !/^\/track\/[a-zA-Z0-9]+$/.test(url.pathname)) {
    throw new ListeningError("invalid_response");
  }
  let image = null;
  const candidate = track.album.images?.[0]?.url;
  if (candidate) {
    const cover = new URL(candidate);
    if (cover.protocol !== "https:" || !cover.hostname.endsWith(".scdn.co")) throw new ListeningError("invalid_response");
    image = cover.href;
  }
  if (playedAt !== null && !Number.isFinite(Date.parse(playedAt))) throw new ListeningError("invalid_response");
  return {
    title: track.name,
    artists: track.artists.map((artist) => artist.name).join(", "),
    album: track.album.name,
    image,
    url: url.href,
    playedAt,
  };
}

export function recentTracks(items) {
  if (!Array.isArray(items)) throw new ListeningError("invalid_response");
  const tracks = [];
  const seen = new Set();
  for (const item of items.slice(0, 10)) {
    if (!text(item.played_at)) throw new ListeningError("invalid_response");
    const track = normalizeTrack(item.track, item.played_at);
    if (!track || seen.has(track.url)) continue;
    seen.add(track.url);
    tracks.push(track);
    if (tracks.length === 3) break;
  }
  return tracks;
}

export function refreshedAuthorization(auth, token, now) {
  if (!text(token.access_token) || !Number.isFinite(token.expires_in) || token.expires_in <= 0 ||
      token.refresh_token !== undefined && !text(token.refresh_token)) {
    throw new ListeningError("invalid_response");
  }
  return {
    ...auth,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || auth.refreshToken,
    expiresAt: now + token.expires_in * 1000,
  };
}

export function createListeningHandler(store, { fetch: request = globalThis.fetch, now = Date.now, log = console.error } = {}) {
  let cached = null;
  let pending = null;
  async function spotify(url, options = {}) {
    const response = await request(url, { ...options, signal: AbortSignal.timeout(8000) });
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"));
      throw new ListeningError("rate_limited", 429, Math.min(600, Math.max(30, Number.isFinite(seconds) ? seconds : 30)));
    }
    return response;
  }
  async function load() {
    if (!store) throw new ListeningError("not_connected");
    let auth = await store.get("spotify-auth", "json");
    if (!auth) throw new ListeningError("not_connected");
    if (auth.reauthorizationRequired) throw new ListeningError("authorization_required");
    if (auth.ownerId !== SPOTIFY_OWNER || !text(auth.clientId) || !text(auth.refreshToken) ||
        !text(auth.accessToken) || !Number.isFinite(auth.expiresAt)) {
      throw new ListeningError("invalid_configuration");
    }
    async function refresh() {
      const response = await spotify(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: auth.clientId, refresh_token: auth.refreshToken }),
      });
      if (!response.ok) {
        const error = await response.json();
        if (error.error === "invalid_grant") {
          await store.put("spotify-auth", JSON.stringify({ ownerId: auth.ownerId, clientId: auth.clientId, reauthorizationRequired: true }));
          throw new ListeningError("authorization_required");
        }
        throw new ListeningError(response.status < 500 ? "authorization_required" : "unavailable");
      }
      auth = refreshedAuthorization(auth, await response.json(), now());
      await store.put("spotify-auth", JSON.stringify(auth));
    }
    if (auth.expiresAt <= now() + 60000) await refresh();
    async function get(path) {
      let response = await spotify(`${API}${path}`, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
      if (response.status === 401) {
        await refresh();
        response = await spotify(`${API}${path}`, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
      }
      if (!response.ok) throw new ListeningError([401, 403].includes(response.status) ? "authorization_required" : "unavailable");
      return response.status === 204 ? null : response.json();
    }
    const current = await get("/me/player/currently-playing");
    if (current?.device?.is_private_session) return { state: "private", track: null, recent: [] };
    if (current !== null && typeof current?.is_playing !== "boolean") throw new ListeningError("invalid_response");
    const playing = current?.is_playing ? normalizeTrack(current.item) : null;
    const history = await get("/me/player/recently-played?limit=10");
    const recent = recentTracks(history?.items);
    if (playing) return { state: "playing", track: playing, recent };
    const track = recent[0] || null;
    return { state: track ? "recent" : "empty", track, recent };
  }
  async function result() {
    try {
      return { status: 200, body: { ...await load(), checkedAt: new Date(now()).toISOString() }, lifetime: CACHE_SECONDS };
    } catch (error) {
      const known = error instanceof ListeningError;
      const code = known ? error.code : "unavailable";
      if (code !== "not_connected") log("Spotify listening:", code);
      return { status: known ? error.status : 503, body: { error: code }, lifetime: known ? error.retryAfter : CACHE_SECONDS };
    }
  }
  return async (request) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
    }
    if (!cached || cached.expiresAt <= now()) {
      pending ??= result().then((value) => {
        cached = { ...value, expiresAt: now() + value.lifetime * 1000 };
      }).finally(() => { pending = null; });
      await pending;
    }
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": cached.status === 200 ? `public, max-age=${CACHE_SECONDS}` : "no-store",
    };
    if (cached.status !== 200) headers["Retry-After"] = String(cached.lifetime);
    return new Response(request.method === "HEAD" ? null : JSON.stringify(cached.body), { status: cached.status, headers });
  };
}
