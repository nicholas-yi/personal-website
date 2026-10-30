import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createListeningHandler } from "./spotify.mjs";

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/about", ["about.html", "text/html; charset=utf-8"]],
  ["/about.html", ["about.html", "text/html; charset=utf-8"]],
  ["/links", ["links.html", "text/html; charset=utf-8"]],
  ["/links.html", ["links.html", "text/html; charset=utf-8"]],
  ["/404", ["404.html", "text/html; charset=utf-8"]],
  ["/404.html", ["404.html", "text/html; charset=utf-8"]],
  ["/social-card.png", ["social-card.png", "image/png"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/garden.js", ["garden.js", "text/javascript; charset=utf-8"]],
  ["/listening.js", ["listening.js", "text/javascript; charset=utf-8"]],
  ["/rain.js", ["rain.js", "text/javascript; charset=utf-8"]],
  ["/umbrella.js", ["umbrella.js", "text/javascript; charset=utf-8"]],
  ["/house.js", ["house.js", "text/javascript; charset=utf-8"]],
  ["/hearth.js", ["hearth.js", "text/javascript; charset=utf-8"]],
  ["/puddles.js", ["puddles.js", "text/javascript; charset=utf-8"]],
  ["/rain-audio.js", ["rain-audio.js", "text/javascript; charset=utf-8"]],
  ["/audio/garden-rain.mp3", ["audio/garden-rain.mp3", "audio/mpeg"]],
  ["/audio/forest-rain.mp3", ["audio/forest-rain.mp3", "audio/mpeg"]],
  ["/interaction-sounds.js", ["interaction-sounds.js", "text/javascript; charset=utf-8"]],
  ["/connection-matrix.js", ["connection-matrix.js", "text/javascript; charset=utf-8"]],
  ["/graph.js", ["graph.js", "text/javascript; charset=utf-8"]],
  ["/graph-model.js", ["graph-model.js", "text/javascript; charset=utf-8"]],
  ["/graph-motion.js", ["graph-motion.js", "text/javascript; charset=utf-8"]],
  ["/graph.css", ["graph.css", "text/css; charset=utf-8"]],
]);

export function createSiteServer({ spotifyStore = null, useHostedSpotify = false, hostedFetch = globalThis.fetch } = {}) {
  const localListening = createListeningHandler(spotifyStore);
  async function listening(request) {
    if (!useHostedSpotify) return localListening(request);
    try {
      const upstream = await hostedFetch("https://nicholasyi.me/api/listening", {
        method: request.method,
        headers: { Accept: "application/json" },
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!upstream.headers.get("content-type")?.includes("application/json")) {
        throw new Error("The production listening endpoint has not been deployed as a JSON API.");
      }
      const headers = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff" };
      for (const name of ["cache-control", "retry-after"]) {
        if (upstream.headers.has(name)) headers[name] = upstream.headers.get(name);
      }
      return new Response(request.method === "HEAD" ? null : await upstream.text(), { status: upstream.status, headers });
    } catch (error) {
      console.error("Hosted Spotify preview:", error instanceof Error ? error.message : "The production endpoint could not be reached.");
      return new Response(request.method === "HEAD" ? null : JSON.stringify({ error: "unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      });
    }
  }
  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed.");
      return;
    }

    const pathname = request.url.split("?")[0];
    const asset = assets.get(pathname) ?? assets.get("/404.html");
    const status = !assets.has(pathname) || asset[0] === "404.html" ? 404 : 200;

    try {
      if (pathname === "/api/listening") {
        const result = await listening(new Request("http://127.0.0.1/api/listening", { method: request.method }));
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(request.method === "HEAD" ? undefined : await result.text());
        return;
      }
      const content = await readFile(new URL(`public/${asset[0]}`, import.meta.url));
      response.writeHead(status, {
        "Content-Type": asset[1],
        "Content-Length": content.length,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      console.error(`Couldn't serve ${pathname}:`, error);
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : "Couldn't load the page. Check the server output.");
    }
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535.");
  const authFile = new URL(".spotify-auth.json", import.meta.url);
  const server = createSiteServer({
    useHostedSpotify: process.argv.includes("--live-spotify"),
    spotifyStore: {
      async get(key) {
        if (key !== "spotify-auth") throw new Error("Unknown Spotify storage key.");
        try {
          return JSON.parse(await readFile(authFile, "utf8"));
        } catch (error) {
          if (error.code === "ENOENT") return null;
          throw error;
        }
      },
      async put(key, value) {
        if (key !== "spotify-auth") throw new Error("Unknown Spotify storage key.");
        await writeFile(authFile, value, { mode: 0o600 });
      },
    },
  });
  server.on("error", (error) => {
    console.error(`Website server failed: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Nicholas Yi's website: http://127.0.0.1:${port}`);
    console.log(`Serving ${fileURLToPath(new URL("public", import.meta.url))}`);
    if (process.argv.includes("--live-spotify")) console.log("Spotify preview: read-only mirror of https://nicholasyi.me/api/listening; no local token is used.");
    console.log("Press Ctrl+C to stop.");
  });
}
