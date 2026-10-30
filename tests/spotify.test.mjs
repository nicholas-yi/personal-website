import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import worker from "../worker.mjs";
import { createListeningHandler, normalizeTrack, recentTracks, SPOTIFY_OWNER, SPOTIFY_SCOPES } from "../spotify.mjs";
import { createAuthorization, exchangeAuthorization, REDIRECT_URI, verifyCallback } from "../scripts/spotify-connect.mjs";
import { createSiteServer } from "../server.mjs";

const clock = Date.parse("2026-10-30T12:00:00Z");
const track = {
  type: "track", name: "Fixture song", is_local: false,
  artists: [{ name: "Fixture artist" }],
  album: { name: "Fixture album", images: [{ url: "https://i.scdn.co/image/fixture" }] },
  external_urls: { spotify: "https://open.spotify.com/track/fixture123" },
};
const authorization = {
  ownerId: SPOTIFY_OWNER, clientId: "a".repeat(32),
  accessToken: "fixture-access", refreshToken: "fixture-refresh", expiresAt: clock + 3600000,
};
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const get = (method = "GET") => new Request("https://example.test/api/listening", { method });

function storeFixture(auth = authorization) {
  let value = structuredClone(auth);
  return {
    writes: [],
    async get(key, format) {
      assert.equal(key, "spotify-auth");
      assert.equal(format, "json");
      return structuredClone(value);
    },
    async put(key, body) {
      assert.equal(key, "spotify-auth");
      value = JSON.parse(body);
      this.writes.push(structuredClone(value));
    },
    current() { return structuredClone(value); },
  };
}

test("the public track shape excludes credentials, account, devices, and raw history", () => {
  const result = normalizeTrack({ ...track, secret: authorization.accessToken });
  assert.deepEqual(result, {
    title: "Fixture song", artists: "Fixture artist", album: "Fixture album",
    image: "https://i.scdn.co/image/fixture", url: "https://open.spotify.com/track/fixture123", playedAt: null,
  });
  assert.equal(normalizeTrack({ ...track, is_local: true }), null);
  assert.equal(normalizeTrack({ type: "episode" }), null);
  assert.equal(normalizeTrack({ ...track, album: { name: "Album" } }).image, null);
  for (const invalid of [
    { ...track, name: "" },
    { ...track, artists: [] },
    { ...track, external_urls: { spotify: "https://evil.example/track/fixture123" } },
    { ...track, album: { name: "Album", images: [{ url: "javascript:alert(1)" }] } },
  ]) assert.throws(() => normalizeTrack(invalid));
  assert.throws(() => normalizeTrack(track, "not-a-date"));
});

test("playing returns a three-record shelf with only two upstream calls per cached snapshot", async () => {
  const store = storeFixture();
  let calls = 0;
  let time = clock;
  const handler = createListeningHandler(store, {
    now: () => time,
    fetch: async (url, options) => {
      calls++;
      assert.equal(options.headers.Authorization, "Bearer fixture-access");
      if (url.endsWith("currently-playing")) return json({ is_playing: true, item: track, device: { name: "Not public" } });
      assert.ok(url.endsWith("recently-played?limit=10"));
      return json({ items: [{ track, played_at: "2026-10-29T10:00:00Z" }] });
    },
  });
  const responses = await Promise.all(Array.from({ length: 10 }, () => handler(get())));
  assert.equal(calls, 2);
  const data = await responses[0].json();
  assert.deepEqual(Object.keys(data).sort(), ["checkedAt", "recent", "state", "track"]);
  assert.equal(data.state, "playing");
  assert.equal(data.recent.length, 1);
  assert.ok(!JSON.stringify(data).includes("fixture-access") && !JSON.stringify(data).includes("Not public"));
  assert.equal(responses[0].headers.get("cache-control"), "public, max-age=30");
  const head = await handler(get("HEAD"));
  assert.equal(await head.text(), "");
  assert.equal(calls, 2);
  time += 30001;
  await handler(get());
  assert.equal(calls, 4);
  assert.equal(store.writes.length, 0);
});

test("paused or absent playback shows the latest history item, labeled recent with its real date", async () => {
  for (const current of [null, { is_playing: false, item: track }]) {
    const calls = [];
    const handler = createListeningHandler(storeFixture(), {
      now: () => clock,
      fetch: async (url) => {
        calls.push(url);
        return url.endsWith("currently-playing")
          ? current ? json(current) : new Response(null, { status: 204 })
          : json({ items: [{ track, played_at: "2026-10-29T10:00:00Z" }] });
      },
    });
    const response = await handler(get());
    const data = await response.json();
    assert.equal(data.state, "recent");
    assert.equal(data.track.playedAt, "2026-10-29T10:00:00Z");
    assert.equal(calls.length, 2);
    assert.ok(calls[1].endsWith("recently-played?limit=10"));
  }
});

test("private, empty, and unsupported-media cases never invent a live song", async () => {
  const privateHandler = createListeningHandler(storeFixture(), {
    now: () => clock,
    fetch: async (url) => {
      assert.ok(url.endsWith("currently-playing"));
      return json({ is_playing: true, item: track, device: { is_private_session: true } });
    },
  });
  const privateData = await (await privateHandler(get())).json();
  assert.equal(privateData.state, "private");
  assert.deepEqual(privateData.recent, []);
  const empty = createListeningHandler(storeFixture(), {
    now: () => clock,
    fetch: async (url) => url.endsWith("currently-playing")
      ? json({ is_playing: true, item: { type: "episode" } })
      : json({ items: [] }),
  });
  const data = await (await empty(get())).json();
  assert.equal(data.state, "empty");
  assert.equal(data.track, null);
  assert.deepEqual(data.recent, []);
});

test("expired access tokens refresh once and persist rotated refresh tokens before fetching tracks", async () => {
  const store = storeFixture({ ...authorization, expiresAt: clock });
  let calls = 0;
  const handler = createListeningHandler(store, {
    now: () => clock,
    fetch: async (url, options) => {
      calls++;
      if (url.includes("accounts.spotify.com")) {
        assert.equal(options.method, "POST");
        assert.equal(options.body.get("grant_type"), "refresh_token");
        assert.equal(options.body.get("client_id"), authorization.clientId);
        assert.equal(options.body.get("refresh_token"), "fixture-refresh");
        assert.equal(options.body.has("client_secret"), false);
        return json({ access_token: "fixture-new-access", refresh_token: "fixture-rotated", expires_in: 3600 });
      }
      assert.equal(store.writes.length, 1);
      assert.equal(options.headers.Authorization, "Bearer fixture-new-access");
      return url.endsWith("currently-playing") ? json({ is_playing: true, item: track }) : json({ items: [] });
    },
  });
  const data = await (await handler(get())).json();
  assert.equal(data.state, "playing");
  assert.equal(calls, 3);
  assert.equal(store.current().refreshToken, "fixture-rotated");
  assert.equal(store.current().expiresAt, clock + 3600000);
  assert.ok(!JSON.stringify(data).includes("fixture-new-access") && !JSON.stringify(data).includes("fixture-rotated"));
});

test("the shelf keeps only three most-recent distinct public tracks and strips all raw history fields", () => {
  const item = (id, played_at = "2026-10-29T10:00:00Z") => ({
    track: { ...track, name: `Song ${id}`, external_urls: { spotify: `https://open.spotify.com/track/fixture${id}` } },
    played_at, privateContext: "must-not-leak",
  });
  const input = [item(1), item(1, "2026-10-29T09:00:00Z"), { ...item(7), track: { ...track, is_local: true } }, item(2), item(3), item(4)];
  const result = recentTracks(input);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(track => track.title), ["Song 1", "Song 2", "Song 3"]);
  assert.equal(result[0].playedAt, "2026-10-29T10:00:00Z");
  assert.ok(!JSON.stringify(result).includes("privateContext"));
  assert.deepEqual(recentTracks(Array.from({ length: 11 }, (_, i) => i < 10 ? item(1) : item(2))).map(track => track.title), ["Song 1"]);
  assert.throws(() => recentTracks(null));
  assert.throws(() => recentTracks([{ track, played_at: "not-a-date" }]));
  assert.throws(() => recentTracks([{ track }]));
});

test("history failures remain explicit errors even while a current track is available", async () => {
  const logs = [];
  const handler = createListeningHandler(storeFixture(), {
    now: () => clock, log: (...args) => logs.push(args),
    fetch: async (url) => url.endsWith("currently-playing")
      ? json({ is_playing: true, item: track }) : json({ error: "temporary" }, 502),
  });
  const response = await handler(get());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "unavailable" });
  assert.equal(logs.length, 1);
});

test("a 401 refreshes and retries only once, without an unbounded token loop", async () => {
  let playerCalls = 0;
  let tokenCalls = 0;
  const handler = createListeningHandler(storeFixture(), {
    now: () => clock, log() {},
    fetch: async (url) => {
      if (url.includes("accounts.spotify.com")) {
        tokenCalls++;
        return json({ access_token: "fixture-new-access", expires_in: 3600 });
      }
      playerCalls++;
      return json({}, 401);
    },
  });
  const response = await handler(get());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "authorization_required" });
  assert.equal(playerCalls, 2);
  assert.equal(tokenCalls, 1);
});

test("revoked/expired refresh grants discard credentials and do not keep retrying invalid grants", async () => {
  const store = storeFixture({ ...authorization, expiresAt: clock });
  let calls = 0;
  let time = clock;
  const handler = createListeningHandler(store, {
    now: () => time, log() {},
    fetch: async () => { calls++; return json({ error: "invalid_grant" }, 400); },
  });
  assert.equal((await handler(get())).status, 503);
  assert.deepEqual(store.current(), { ownerId: SPOTIFY_OWNER, clientId: authorization.clientId, reauthorizationRequired: true });
  time += 31000;
  assert.equal((await handler(get())).status, 503);
  assert.equal(calls, 1);
});

test("missing setup and unsupported methods are explicit and make no upstream calls", async () => {
  for (const store of [null, storeFixture(null)]) {
    const handler = createListeningHandler(store, { fetch: () => assert.fail("Should not call Spotify") });
    const response = await handler(get());
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "not_connected" });
    assert.equal(response.headers.get("cache-control"), "no-store");
    const post = await handler(get("POST"));
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET, HEAD");
  }
});

test("rate limits back off; malformed upstream data, storage failures, and network errors never become empty-success tracks", async () => {
  let time = clock;
  let calls = 0;
  const limited = createListeningHandler(storeFixture(), {
    now: () => time, log() {},
    fetch: async () => { calls++; return json({}, 429, { "Retry-After": "120" }); },
  });
  let response = await limited(get());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "120");
  time += 60000;
  await limited(get());
  assert.equal(calls, 1);
  time += 60001;
  await limited(get());
  assert.equal(calls, 2);
  for (const fetch of [
    async () => json({ unexpected: "fixture-secret" }),
    async () => json({ is_playing: false }),
    async () => { throw new Error("fixture-secret"); },
  ]) {
    const logs = [];
    const handler = createListeningHandler(storeFixture(), { now: () => clock, fetch, log: (...args) => logs.push(args) });
    response = await handler(get());
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes("fixture-secret"));
    assert.ok(!JSON.stringify(logs).includes("fixture-secret"));
    assert.ok(logs.length);
  }
  const brokenStore = createListeningHandler({ get: async () => { throw new Error("fixture-secret"); } }, { log() {} });
  assert.equal((await brokenStore(get())).status, 503);
});

test("Worker dispatch leaves static assets alone and fails clearly before its KV binding is configured", async () => {
  const calls = [];
  const env = { ASSETS: { fetch: async (request) => { calls.push(request.url); return new Response("static asset"); } } };
  assert.equal(await (await worker.fetch(new Request("https://example.test/about"), env)).text(), "static asset");
  assert.equal(calls.length, 1);
  const response = await worker.fetch(get(), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "not_connected" });
  assert.equal(calls.length, 1);
});

test("local live-preview mode mirrors only the fixed public production endpoint without reading credentials", async () => {
  const requests = [];
  let upstreamStatus = 200;
  const server = createSiteServer({
    useHostedSpotify: true,
    spotifyStore: { get() { assert.fail("Production mirror must not read local credentials"); } },
    hostedFetch: async (url, options) => {
      requests.push({ url, options });
      return json(upstreamStatus === 200 ? { state: "playing", track: normalizeTrack(track) } : { error: "authorization_required" }, upstreamStatus, {
        "Content-Type": "application/json", "Cache-Control": upstreamStatus === 200 ? "public, max-age=30" : "no-store",
        "Retry-After": "30", "Set-Cookie": "not-forwarded=1",
      });
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${origin}/api/listening?target=https://invalid.example`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state, "playing");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "public, max-age=30");
    assert.equal(requests[0].url, "https://nicholasyi.me/api/listening");
    assert.equal(requests[0].options.credentials, "omit");
    assert.equal(requests[0].options.redirect, "error");
    assert.equal(requests[0].options.headers.Authorization, undefined);
    response = await fetch(`${origin}/api/listening`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
    assert.equal(requests[1].options.method, "HEAD");
    upstreamStatus = 503;
    response = await fetch(`${origin}/api/listening`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "authorization_required" });
    const calls = requests.length;
    assert.equal((await fetch(`${origin}/api/listening`, { method: "POST" })).status, 405);
    assert.equal(requests.length, calls);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("local live-preview mode reports unreachable or undeployed production APIs as failures, not tracks", async (t) => {
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  let unreachable = false;
  const server = createSiteServer({
    useHostedSpotify: true,
    hostedFetch: async () => {
      if (unreachable) throw new Error("Public endpoint unreachable");
      return new Response("<h1>Not found</h1>", { status: 404, headers: { "Content-Type": "text/html" } });
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const failsByNetwork of [false, true]) {
      unreachable = failsByNetwork;
      const response = await fetch(`${origin}/api/listening`);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { error: "unavailable" });
    }
    assert.equal(errors.length, 2);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("PKCE uses unpredictable state/verifiers, exact loopback redirect, and only the two listening scopes", () => {
  const first = createAuthorization(authorization.clientId);
  const second = createAuthorization(authorization.clientId);
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.verifier, second.verifier);
  const url = new URL(first.url);
  assert.equal(url.origin, "https://accounts.spotify.com");
  assert.equal(url.searchParams.get("redirect_uri"), REDIRECT_URI);
  assert.equal(url.searchParams.get("scope"), SPOTIFY_SCOPES.join(" "));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(first.verifier).digest("base64url"));
  assert.equal(url.searchParams.has("client_secret"), false);
  assert.ok(first.verifier.length >= 43 && first.verifier.length <= 128);
  assert.throws(() => createAuthorization("not-a-client-id"));
  assert.equal(verifyCallback(new URL(`${REDIRECT_URI}?state=${first.state}&code=fixture-code`), first.state), "fixture-code");
  assert.throws(() => verifyCallback(new URL(`${REDIRECT_URI}?state=wrong&code=fixture-code`), first.state));
  assert.throws(() => verifyCallback(new URL(`${REDIRECT_URI}?state=${first.state}&error=access_denied`), first.state));
  assert.throws(() => verifyCallback(new URL(`${REDIRECT_URI}?state=${first.state}`), first.state));
});

test("owner authorization validates scopes and the exact Spotify account, never returns profile data", async () => {
  const auth = createAuthorization(authorization.clientId);
  const token = { access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600, scope: SPOTIFY_SCOPES.join(" ") };
  const request = async (url, options) => {
    if (url.includes("accounts.spotify.com")) {
      assert.equal(options.body.get("code_verifier"), auth.verifier);
      assert.equal(options.body.get("redirect_uri"), REDIRECT_URI);
      assert.equal(options.body.get("code"), "fixture-code");
      return json(token);
    }
    return json({ id: SPOTIFY_OWNER, email: "not-public@example.test" });
  };
  const result = await exchangeAuthorization(auth, "fixture-code", request, clock);
  assert.deepEqual(result, authorization);
  assert.ok(!JSON.stringify(result).includes("not-public"));
  for (const body of [
    { ...token, scope: "user-read-currently-playing" },
    { ...token, refresh_token: null },
  ]) await assert.rejects(() => exchangeAuthorization(auth, "fixture-code", async () => json(body), clock));
  await assert.rejects(() => exchangeAuthorization(auth, "fixture-code", async (url) =>
    json(url.includes("accounts.spotify.com") ? token : { id: "another-account" }), clock), /not the Spotify account/);
  await assert.rejects(() => exchangeAuthorization(auth, "fixture-code", async () => new Response("fixture-secret"), clock), /unreadable response/);
});
