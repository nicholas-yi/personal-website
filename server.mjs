import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/about", ["about.html", "text/html; charset=utf-8"]],
  ["/about.html", ["about.html", "text/html; charset=utf-8"]],
  ["/links", ["links.html", "text/html; charset=utf-8"]],
  ["/links.html", ["links.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/garden.js", ["garden.js", "text/javascript; charset=utf-8"]],
  ["/rain.js", ["rain.js", "text/javascript; charset=utf-8"]],
  ["/umbrella.js", ["umbrella.js", "text/javascript; charset=utf-8"]],
  ["/house.js", ["house.js", "text/javascript; charset=utf-8"]],
  ["/rain-audio.js", ["rain-audio.js", "text/javascript; charset=utf-8"]],
  ["/interaction-sounds.js", ["interaction-sounds.js", "text/javascript; charset=utf-8"]],
  ["/connection-matrix.js", ["connection-matrix.js", "text/javascript; charset=utf-8"]],
  ["/graph.js", ["graph.js", "text/javascript; charset=utf-8"]],
  ["/graph-model.js", ["graph-model.js", "text/javascript; charset=utf-8"]],
  ["/graph-motion.js", ["graph-motion.js", "text/javascript; charset=utf-8"]],
  ["/graph.css", ["graph.css", "text/css; charset=utf-8"]],
]);

export function createSiteServer() {
  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed.");
      return;
    }

    const pathname = request.url.split("?")[0];
    const asset = assets.get(pathname);
    if (!asset) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : "Not found.");
      return;
    }

    try {
      const content = await readFile(new URL(`public/${asset[0]}`, import.meta.url));
      response.writeHead(200, {
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
  const server = createSiteServer();
  server.on("error", (error) => {
    console.error(`Website server failed: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Nicholas Yi's website: http://127.0.0.1:${port}`);
    console.log(`Serving ${fileURLToPath(new URL("public", import.meta.url))}`);
    console.log("Press Ctrl+C to stop.");
  });
}
