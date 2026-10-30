import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { SPOTIFY_OWNER, SPOTIFY_SCOPES, refreshedAuthorization } from "../spotify.mjs";

export const REDIRECT_URI = "http://127.0.0.1:4387/callback";

export function createAuthorization(clientId) {
  if (!/^[a-zA-Z0-9]{32}$/.test(clientId)) throw new Error("Enter the 32-character Client ID from your Spotify app.");
  const verifier = randomBytes(64).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.spotify.com/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SPOTIFY_SCOPES.join(" "),
    state,
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    show_dialog: "true",
  });
  return { clientId, verifier, state, url: url.href };
}

export function verifyCallback(url, state) {
  if (url.pathname !== "/callback") throw new Error("Unexpected callback path.");
  const supplied = Buffer.from(url.searchParams.get("state") || "");
  const expected = Buffer.from(state);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Authorization state did not match.");
  if (url.searchParams.has("error")) throw new Error("Spotify authorization was declined. Run the connection command again when ready.");
  const code = url.searchParams.get("code");
  if (!code) throw new Error("Spotify did not return an authorization code.");
  return code;
}

export async function exchangeAuthorization(auth, code, request = globalThis.fetch, now = Date.now()) {
  async function json(response) {
    try {
      return await response.json();
    } catch {
      throw new Error("Spotify returned an unreadable response. Please reconnect.");
    }
  }
  const response = await request("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: auth.clientId,
      code_verifier: auth.verifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Spotify could not exchange the authorization code. Check the app's Client ID and redirect URI, then reconnect.");
  const token = await json(response);
  if (!token.refresh_token || !SPOTIFY_SCOPES.every((scope) => token.scope?.split(" ").includes(scope))) {
    throw new Error("Spotify did not grant both listening permissions and a refresh token. Reconnect and approve both permissions.");
  }
  const result = refreshedAuthorization({ clientId: auth.clientId, refreshToken: token.refresh_token, ownerId: SPOTIFY_OWNER }, token, now);
  const profile = await request("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${result.accessToken}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!profile.ok) throw new Error("Spotify could not verify the authorized account.");
  if ((await json(profile)).id !== SPOTIFY_OWNER) {
    throw new Error("This is not the Spotify account linked from your website. Sign into that account and reconnect.");
  }
  return result;
}

async function connect() {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let clientId;
  try {
    clientId = (await prompt.question("Spotify app Client ID (not the client secret): ")).trim();
  } finally {
    prompt.close();
  }
  const auth = createAuthorization(clientId);
  let processing = false;
  let finish;
  let fail;
  const completed = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const server = createServer(async (request, response) => {
    const headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
    if (request.method !== "GET") {
      response.writeHead(405, { ...headers, Allow: "GET" }).end("Only GET is supported.");
      return;
    }
    let code;
    try {
      code = verifyCallback(new URL(request.url, REDIRECT_URI), auth.state);
    } catch (error) {
      response.writeHead(400, headers).end(error.message);
      return;
    }
    if (processing) {
      response.writeHead(409, headers).end("Authorization is already being completed.");
      return;
    }
    processing = true;
    try {
      const credentials = await exchangeAuthorization(auth, code);
      await writeFile(new URL("../.spotify-auth.json", import.meta.url), JSON.stringify(credentials), { mode: 0o600 });
      response.writeHead(200, headers).end("Connected locally. Close this tab and follow the terminal instructions to upload the private token to Cloudflare.");
      finish();
    } catch (error) {
      response.writeHead(502, headers).end("Could not finish connecting. See the terminal, then try again.");
      fail(error);
    }
  });
  const timer = setTimeout(() => fail(new Error("Authorization timed out after five minutes. Run the command again when ready.")), 300000);
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(4387, "127.0.0.1", resolve);
    });
    server.on("error", fail);
    console.log("This publishes only your current/latest track on your personal site. No playback control is requested.");
    console.log("Open this URL in Edge and approve access:\n", auth.url);
    await completed;
    console.log("Saved .spotify-auth.json locally; it is ignored by Git and is never a public asset.");
    console.log("Upload it without displaying the token:\nnpx wrangler kv key put spotify-auth --binding=SPOTIFY_STORE --remote --path=.spotify-auth.json");
    console.log("Then delete the local file if you do not need a local authenticated preview. Never paste it into chat.");
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  connect().catch((error) => {
    console.error("Spotify connection:", error.message);
    process.exitCode = 1;
  });
}
