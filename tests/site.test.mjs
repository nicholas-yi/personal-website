import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createSiteServer } from "../server.mjs";
import { readFile } from "node:fs/promises";

let server;
let origin;
before(async () => {
  server = createSiteServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

test("the homepage serves real content and working local assets", async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.match(html, /<h1 id="name">Nicholas Yi/);
  for (const id of ["work", "play", "about", "main"]) assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes("https://arxiv.org/abs/2609.34242"));
  assert.ok(html.includes("mailto:nicholasyiofficial@gmail.com"));
  assert.ok(!html.includes("(408)") && !html.includes("5,000") && !html.includes("76.4"));
  for (const [asset, mime] of [["styles.css", /text\/css/], ["garden.js", /javascript/], ["rain.js", /javascript/], ["house.js", /javascript/], ["umbrella.js", /javascript/], ["rain-audio.js", /javascript/], ["interaction-sounds.js", /javascript/], ["connection-matrix.js", /javascript/], ["graph.css", /text\/css/], ["graph.js", /javascript/], ["graph-model.js", /javascript/], ["graph-motion.js", /javascript/]]) {
    const resource = await fetch(`${origin}/${asset}`);
    assert.equal(resource.status, 200);
    assert.match(resource.headers.get("content-type"), mime);
    assert.equal(resource.headers.get("x-content-type-options"), "nosniff");
    assert.ok((await resource.text()).length > 0);
  }
});

test("HEAD requests return the same metadata with no body", async () => {
  const response = await fetch(origin, { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.ok(Number(response.headers.get("content-length")) > 1000);
  assert.equal(await response.text(), "");
});

test("the reading experience and keyboard skip target don't depend on JavaScript", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes('class="skip-link" href="#main"'));
  assert.ok(html.includes('<main id="main" tabindex="-1">'));
  assert.ok(html.includes('class="garden-controls" aria-label="Atmosphere settings" hidden'));
  assert.ok(html.includes('<canvas id="garden" aria-hidden="true">'));
  assert.ok(!html.includes("<audio") && !html.includes("autoplay"));
});

test("sound defaults off with a crossed-out speaker and starts only through its own control", async () => {
  for (const path of ["/", "/about.html", "/links.html", "/notes/evaluation", "/404.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    assert.ok(html.includes('<button id="sound-toggle" type="button" aria-pressed="false" aria-label="Enable sound" title="Enable sound"'));
    assert.ok(html.includes('<span id="sound-label" class="sr-only">sound off</span>'));
    assert.ok(html.includes('class="sound-muted"'));
    assert.ok(!html.includes("autoplay"));
  }
});

test("writing links and mail copy progressively enhance native controls", async () => {
  const tools = await fetch(`${origin}/page-tools.js`);
  assert.equal(tools.status, 200);
  assert.match(tools.headers.get("content-type"), /javascript/);
  const home = await (await fetch(origin)).text();
  assert.ok(home.includes('class="mail-corner"'));
  assert.ok(home.includes('data-copy-email aria-label="Copy email address" hidden'));
  assert.ok(home.includes('class="copy-status" role="status" aria-live="polite"'));
  const links = await (await fetch(`${origin}/links.html`)).text();
  for (const id of ["stashbird-case-study", "evaluation-field-note"]) assert.ok(links.includes(`id="${id}"`));
  assert.doesNotMatch(links, /data-copy-note|story-tools|copy note link|class="copy-status"/);
});

test("all pages restore a manual palette before CSS and provide an independent accessible lamp toggle", async () => {
  for (const path of ["/", "/about.html", "/links.html", "/notes/evaluation", "/404.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    assert.match(html, /<script src="\/?theme\.js"><\/script>/);
    assert.ok(html.indexOf("theme.js") < html.indexOf("styles.css"));
    assert.match(html, /<link rel="stylesheet" href="\/?theme\.css">/);
    assert.ok(html.includes('id="theme-toggle" type="button" aria-pressed="false" aria-label="Switch to lamplight"'));
    assert.ok(html.includes('class="theme-lamp"') && html.includes('class="theme-daylight"'));
  }
  for (const [path, mime] of [["theme.js", /javascript/], ["theme.css", /text\/css/]]) {
    const asset = await fetch(`${origin}/${path}`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), mime);
  }
});

test("the README documents running, testing, deployment boundaries and audio credits", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  for (const text of ["npm start", "npm test", "does not itself gate Cloudflare deployment", "AUDIO-CREDITS.md", "SPOTIFY-SETUP.md"]) {
    assert.ok(readme.includes(text));
  }
  assert.doesNotMatch(readme, /if a test fails, nothing goes live/);
});

test("approved natural rain files are self-hosted audio with explicit credits and a bounded download size", async () => {
  let total = 0;
  for (const name of ["garden-rain", "forest-rain"]) {
    const response = await fetch(`${origin}/audio/${name}.mp3`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length > 600000 && bytes.length < 850000);
    total += bytes.length;
    const head = await fetch(`${origin}/audio/${name}.mp3`, { method: "HEAD" });
    assert.equal(Number(head.headers.get("content-length")), bytes.length);
    assert.equal(await head.text(), "");
  }
  assert.ok(total < 1500000);
  const credits = await readFile(new URL("../AUDIO-CREDITS.md", import.meta.url), "utf8");
  for (const author of ["barkenov", "AlanCat", "CC0"]) assert.ok(credits.includes(author));
});

test("ASCII companion decorations are hidden from assistive technology", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes('class="record-spindle">()</span>'));
  assert.ok(html.includes('<pre class="record-art" aria-hidden="true"><span class="record-notes">'));
  assert.ok(html.includes('class="record-sleeve"'));
  assert.ok(html.includes('class="winged-mail" aria-hidden="true"'));
});

test("all pages use the same simple navigation", async () => {
  for (const path of ["/", "/links.html", "/about.html", "/notes/evaluation", "/404"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    const nav = html.match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)[1];
    assert.deepEqual([...nav.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map((match) => match[1]), ["work", "play", "about", "field notes"]);
  }
});

test("all pages end with document-bottom ASCII puddles and accessible icon-only weather controls", async () => {
  for (const path of ["/", "/about.html", "/links.html", "/notes/evaluation", "/404.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    assert.ok(html.includes('class="page-puddles" aria-hidden="true"'));
    assert.ok(html.indexOf('class="page-puddles"') > html.indexOf("</footer>"));
    assert.ok(html.includes('class="control-off"'));
    assert.ok(html.includes('class="sound-muted" d="m3 3 14 14"'));
    assert.ok(html.includes('id="motion-label" class="sr-only"'));
    assert.ok(html.includes('id="sound-label" class="sr-only"'));
    assert.ok(html.includes('aria-label="Enable sound"') && html.includes('aria-label="Enable rain animation"'));
  }
  const response = await fetch(`${origin}/puddles.js`);
  assert.equal(response.status, 200);
});

test("social links do not point to local or private resume files", async () => {
  for (const path of ["/", "/links.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    const socials = html.match(/<ul class="social-links"[\s\S]*?<\/ul>/)[0];
    assert.doesNotMatch(socials, /file:|C:\\|Nicholas_Yi_Evals/);
  }
  assert.equal((await fetch(`${origin}/resume.pdf`)).status, 404);
});

test("the graph keeps readable fallback content without JavaScript", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes("data-graph-playground"));
  assert.ok(html.includes('class="graph-fallback"'));
  assert.ok(html.includes("Enable JavaScript to connect the dots."));
});

test("the larger four-pane window has framing and a weather opening", async () => {
  const html = await (await fetch(origin)).text();
  for (const part of ["window-lintel", "window-opening", "window-mullion", "window-crossbar", "window-sill"]) {
    assert.ok(html.includes(part));
  }
  assert.ok(html.includes('class="intro-content"'));
});

test("public accomplishments link to the paper, PDF, article, and official competition results", async () => {
  const homepage = await (await fetch(origin)).text();
  assert.ok(homepage.includes('href="links.html"'));
  const response = await fetch(`${origin}/links.html`);
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const url of [
    "https://arxiv.org/abs/2609.34242",
    "https://arxiv.org/pdf/2609.34242",
    "https://medium.com/data-science-at-microsoft/graphrag-beyond-the-demo-lessons-from-the-trenches-add83180f849",
    "https://www.kaggle.com/competitions/kuzushiji-recognition/leaderboard",
    "https://www.drivendata.org/competitions/70/hateful-memes-phase-2/leaderboard/#leaderRow_151286",
    "https://proceedings.mlr.press/v133/kiela21a.html",
    "https://github.com/microsoft/Staccato-Stuttered-ASR",
  ]) assert.ok(html.includes(`href="${url}"`), url);
  assert.ok(html.includes("17th out of 293 teams") && html.includes("18th place in Phase 2; 3,173 registrants in that phase."));
  const hatefulMemes = html.match(/<li class="public-link-entry" id="hateful-memes">([\s\S]*?)<\/li>/)[1];
  assert.ok(hatefulMemes.includes("organizers' challenge report"));
  assert.ok(!hatefulMemes.includes("3,173 competitors") && !hatefulMemes.includes("3,000+ participants"));
  assert.ok(html.includes("logographic &amp; linguistic OCR"));
  assert.ok(html.includes('aria-label="Stashbird preprint PDF"'));
  assert.ok(html.includes('aria-label="Kuzushiji Recognition final leaderboard"'));
  assert.ok(html.includes('aria-label="Hateful Memes Phase 2 result, nickyi in eighteenth place"'));
  assert.ok(!html.includes("https://patents.google.com/"));
});

test("the header glass module is served and companion decorations stay bounded", async () => {
  const glass = await fetch(`${origin}/header-glass.js`);
  assert.equal(glass.status, 200);
  assert.match(glass.headers.get("content-type"), /javascript/);
  const home = await (await fetch(origin)).text();
  const notes = home.match(/<span class="record-notes">([\s\S]*?)<\/span>/)[1];
  assert.equal((notes.match(/<i>/g) || []).length, 6);
  assert.equal((home.match(/class="winged-mail(?: mail-late)?"/g) || []).length, 2);
});

test("Links fireplace includes a grounded thinking chair and three accessible future questions", async () => {
  const html = await (await fetch(`${origin}/links.html`)).text();
  assert.ok(html.includes('class="hearth-companions thinking-hearth"'));
  assert.ok(html.includes('class="thinking-chair"'));
  assert.ok(html.includes("rocking armchair angled toward the fireplace"));
  const chair = html.match(/<figure class="thinking-chair"[\s\S]*?<\/figure>/)[0];
  const chairArt = chair.match(/<pre class="thinking-chair-art" aria-hidden="true">([\s\S]*?)<\/pre>/)[1].replace(/\r\n/g, "\n");
  assert.equal(chairArt.split("\n").length, 15);
  assert.match(chairArt, /^[\x20-\x7e\n]+$/);
  assert.deepEqual(chairArt.split("\n").slice(0, 7), [
    "  .--------.",
    " /   .----. \\",
    " |\\   \\    \\ \\",
    " | \\   \\    \\ \\",
    " |  \\   '----' )",
    " '-. '--------'",
    " (  \\.--------'-.",
  ]);
  assert.equal(chairArt.split("\n").slice(7).join("\n"), [
    "(  .------------'--'",
    " \\  \\             \\",
    "  \\  '-----------. )",
    "   '---._________.-'",
    "       / |    / |",
    "      /  |   /  |",
    "  \\__'___|__'___|___/",
    "    '---..____..---'",
  ].join("\n"));
  assert.ok(!chair.includes("<svg") && !chair.includes("<img") && !chair.includes("<animate"));
  assert.ok(html.includes('What does a better score leave out?'));
  assert.ok(html.includes('When does remembering become holding on?'));
  assert.ok(html.includes('Can a correction keep its context?'));
  assert.ok(html.includes('role="group" aria-label="Questions to ponder"'));
  const buttons = [...html.matchAll(/<button class="thought-bubble"[^>]*data-question="([^"]+)"[^>]*>/g)];
  assert.equal(buttons.length, 3);
  for (const [button, question] of buttons) {
    assert.ok(button.includes(`aria-label="${question}"`));
    assert.ok(button.includes('aria-controls="thought-question"'));
  }
  assert.ok(html.includes('id="thought-question" role="status"'));
  assert.ok(html.includes("<noscript><ul"));
  const script = await fetch(`${origin}/thoughts.js`);
  assert.equal(script.status, 200);
});
test("work preserves chronology and the scoped team award alongside the requested accessibility motivation", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes("Speech recognition designed to better understand people who stutter."));
  assert.ok(html.includes("Team 1st place &#183; Ability Hack Executive Challenge"));
  assert.ok(html.includes('class="eyebrow">Microsoft Global Hackathon</div>'));
  assert.ok(html.includes("My brother stutters, so making speech technology more accessible is personal to me."));
  const cards = [...html.matchAll(/<article class="work-item" data-work="([^"]+)">([\s\S]*?)<\/article>/g)];
  assert.deepEqual(cards.map((card) => card[1]), ["mai", "stashbird", "graphrag", "staccato"]);
  for (const [id, date] of [["mai", "2025-07"], ["stashbird", "2026-09"], ["graphrag", "2026-04"], ["staccato", "2025-11"]]) {
    assert.ok(cards.find((card) => card[1] === id)[2].includes(`datetime="${date}"`));
  }
  assert.ok(cards[1][2].includes("preprint"));
  assert.ok(cards[2][2].includes("article"));
  assert.ok(cards[1][2].includes("Collaborative Apps and Platform (CAP) / Microsoft Teams"));
  assert.ok(html.includes('href="https://www.credly.com/badges/6e507446-96ac-45cc-89e7-e40440959f6c"'));
});

test("the links page puts current work first, then milestones in descending date order", async () => {
  const html = await (await fetch(`${origin}/links.html`)).text();
  assert.ok(html.includes('href="index.html#play"'));
  assert.ok(html.includes('href="links.html" aria-current="page"'));
  const entries = [...html.matchAll(/<li class="public-link-entry"[^>]*>([\s\S]*?)<\/li>/g)];
  assert.equal(entries.length, 6);
  const datedEntries = entries.filter((entry) => entry[1].includes("<time"));
  assert.deepEqual(datedEntries.map((entry) => entry[1].match(/datetime="([^"]+)"/)[1]),
    ["2025-07", "2026-09", "2026-04", "2025-11", "2020", "2019"]);
  assert.ok(datedEntries[3][1].includes("Staccato"));
  assert.ok(datedEntries[4][1].includes("Hateful Memes"));
  assert.ok(datedEntries[5][1].includes("Kuzushiji"));
  assert.equal(await (await fetch(`${origin}/links`)).text(), html);
  assert.ok(!html.includes("microsoft.sharepoint.com"));
});

test("the About sidequests are readable lists followed by a contact link", async () => {
  const html = await (await fetch(`${origin}/about.html`)).text();
  const about = html.slice(html.indexOf('class="about-copy"'), html.indexOf('class="house-furniture"'));
  const paths = [...about.matchAll(/<ul class="sidequest-path" role="list">([\s\S]*?)<\/ul>/g)];
  assert.ok(paths.length > 0);
  for (const path of paths) {
    const items = [...path[1].matchAll(/<li>([\s\S]*?)<\/li>/g)];
    assert.ok(items.length > 0 && items.every(item => item[1].trim()));
  }
  const conclusion = about.match(/<p class="sidequest-conclusion">([\s\S]*?)<\/p>/)[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  assert.ok(conclusion.length > 0 && conclusion.endsWith("."));
  assert.ok(about.includes("<p>if any of those are your thing,"));
  assert.ok(!about.includes("Olympian") && !about.includes("competed in the Olympics"));
  assert.ok(html.includes('class="about-garden"') && html.includes("room to grow."));
  assert.equal((await fetch(`${origin}/nicholas-yi.png`)).status, 404);
});

test("the small native umbrella cursor opts in only for eligible fine-pointer space", async () => {
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.ok(css.includes("@media (hover: hover) and (pointer: fine) and (forced-colors: none)"));
  for (const state of ["open", "closed"]) assert.ok(css.includes(`html[data-umbrella-cursor="${state}"]`));
  const cursors = [...css.matchAll(/cursor: url\("(data:image\/svg\+xml,[^"]+)"\) 12 3, auto;/g)];
  assert.equal(cursors.length, 2);
  for (const [, url] of cursors) {
    const svg = decodeURIComponent(url.slice("data:image/svg+xml,".length));
    assert.ok(svg.includes("width='24' height='28'"));
  }
  assert.ok(!css.includes("cursor: none"));
});

test("all pages have global navigation and a still-usable ASCII fireplace", async () => {
  for (const path of ["/", "/links.html", "/about.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    assert.ok(html.includes('class="site-header"'));
    assert.ok(html.includes('href="about.html"'));
    assert.ok(!html.includes('href="index.html#about"'));
    assert.ok(html.includes('class="hearth" role="group"'));
    assert.ok(html.includes('class="hearth-frame hearth-frame-one"'));
    assert.ok(html.includes("a warm place to end up."));
    assert.equal((html.match(/class="house-roof"/g) || []).length, 1);
    assert.equal((html.match(/class="house-body"/g) || []).length, 1);
    assert.ok(html.indexOf('class="house-roof"') < html.indexOf('class="house-body"'));
    assert.ok(html.indexOf('class="house-body"') < html.indexOf('class="hearth"'));
    assert.ok(/class="[^"]*\bhouse-shelter\b[^"]*"/.test(html));
  }
});

test("Links is one continuous roofed house with a floor for each discrete milestone", async () => {
  const html = await (await fetch(`${origin}/links.html`)).text();
  assert.ok(html.includes('class="links-house house-shelter"'));
  assert.ok(html.indexOf('class="house-roof"') < html.indexOf("<h1>Field notes"));
  assert.ok(html.indexOf('class="house-body"') < html.indexOf('class="public-links"'));
  assert.ok(!html.includes("roofed-hearth"));
  assert.equal((html.match(/class="house-roof"/g) || []).length, 1);
  assert.equal((html.match(/class="house-body"/g) || []).length, 1);
  assert.equal((html.match(/class="public-link-entry"/g) || []).length, 6);
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.ok(css.includes(".links-house .public-link-entry { margin-inline: calc(-1 * var(--floor-inset))"));
  assert.ok(css.includes(".links-house { --floor-inset: 12px; }"));
});

test("the added fireplace loop is a compact public audio asset and its proximity shares the weather lifecycle", async () => {
  const response = await fetch(`${origin}/audio/fireplace.mp3`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 350000 && bytes.length < 550000);
  const head = await fetch(`${origin}/audio/fireplace.mp3`, { method: "HEAD" });
  assert.equal(Number(head.headers.get("content-length")), bytes.length);
  assert.equal(await head.text(), "");
  const credits = await readFile(new URL("../AUDIO-CREDITS.md", import.meta.url), "utf8");
  assert.ok(credits.includes("PagDev") && credits.includes("fireplace.mp3"));
});

test("the about house has picture-frame, fireplace, and flower furniture in the new requested order", async () => {
  const html = await (await fetch(`${origin}/about.html`)).text();
  assert.ok(html.includes('class="house-roof"'));
  assert.ok(html.includes('class="house-body"'));
  assert.ok(html.includes('class="house-furniture"'));
  const row = html.slice(html.indexOf('class="house-furniture"')).replace(/\r\n/g, "\n");
  assert.ok(row.indexOf('class="picture-frame"') < row.indexOf('class="hearth"'));
  assert.ok(row.indexOf('class="hearth"') < row.indexOf('class="about-garden"'));
  assert.ok(!html.includes("An empty rectangular picture frame"));
  assert.ok(html.includes('class="picture-photo" src="about-photo.jpg" width="384" height="759"'));
  assert.ok(html.includes('loading="lazy" decoding="async" alt="Nicholas Yi."'));
  assert.ok(html.includes("<span>and room to grow.</span>"));
  const photo = await fetch(`${origin}/about-photo.jpg`);
  assert.equal(photo.status, 200);
  assert.match(photo.headers.get("content-type"), /image\/jpeg/);
  const jpeg = Buffer.from(await photo.arrayBuffer());
  assert.deepEqual([...jpeg.subarray(0, 3)], [255, 216, 255]);
  assert.deepEqual([...jpeg.subarray(-2)], [255, 217]);
  assert.ok(jpeg.length < 100_000);
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /\.house-furniture \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)[^}]*column-gap: 0/);
  assert.equal(row.match(/class="picture-art"[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/)[1].split("\n").length, 14);
  assert.equal(row.match(/class="hearth-surround"[^>]*>([\s\S]*?)<\/pre>/)[1].split("\n").length, 14);
  assert.ok(row.includes('aria-label="Grow all three flowers and welcome a butterfly"'));
  assert.ok(row.includes('class="flower-branch flower-right"'));
  assert.match(css, /\.picture-photo \{[^}]*height: 13\.5em;[^}]*object-fit: cover;[^}]*object-position: center/);
});

test("home has a compact hearth while the other fireplaces retain matching tall art and shared glyph sizing", async () => {
  const surrounds = [];
  for (const path of ["/", "/about", "/links", "/404"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    const art = html.match(/<pre class="hearth-surround" aria-hidden="true">([\s\S]*?)<\/pre>/)[1].replace(/\r\n/g, "\n");
    if (path !== "/") surrounds.push(art);
    assert.equal(art.split("\n").length, path === "/" ? 9 : 14);
    assert.match(art, /^[\x20-\x7e\n]+$/);
    assert.ok(html.includes('class="hearth" role="group"'));
    assert.ok(html.includes('data-scene-detail="embers" aria-label="Stir a few fireplace embers" disabled'));
    assert.equal((html.match(/<span class="hearth-embers" aria-hidden="true"><i>\.<\/i><i>'<\/i><\/span>/g) ?? []).length, 1);
  }
  assert.ok(surrounds.every(art => art === surrounds[0]));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /\.hearth \{[^}]*font: clamp\(3\.5px, 1\.1vw, 11px\)\/1\.35 var\(--mono\)/);
  assert.doesNotMatch(css, /\.(?:house-furniture|hearth-companions) \.hearth \{[^}]*font-size:/);
  assert.match(css, /\.hearth \.ember-trigger \{[^}]*grid-row: 1 \/ 2;/);
});

test("the scene details preserve native controls, three-branch growth, and breathing room below the sill", async () => {
  const home = await (await fetch(origin)).text();
  const about = (await (await fetch(`${origin}/about`)).text()).replace(/\r\n/g, "\n");
  const links = await (await fetch(`${origin}/links`)).text();
  for (const [html, kind] of [[home, "steam"], [home, "plant"], [home, "bird"], [home, "agent"], [home, "graph"], [home, "speech"], [about, "flower"], [links, "chair"]]) {
    assert.match(html, new RegExp(`<button[^>]*type="button"[^>]*data-scene-detail="${kind}"[^>]*aria-label="[^"]+"[^>]*disabled`));
  }
  assert.ok(!home.includes('class="rain-window" aria-hidden="true"'));
  assert.ok(!home.includes('class="work-art bird-art" aria-hidden="true"'));
  const sill = home.match(/<pre class="window-sill"[^>]*>([\s\S]*?)<\/pre>/)[1].replace(/\r\n/g, "\n");
  assert.equal(sill.split("\n").length, 3);
  assert.ok(home.indexOf('class="window-objects"') > home.indexOf(sill));
  assert.ok(home.includes('class="cup-steam"> ( (</span>'));
  assert.ok(home.includes('class="bird-eye"><span>o</span></span>'));
  assert.ok(about.includes('aria-label="Grow all three flowers and welcome a butterfly"'));
  const base = about.match(/<pre class="flower-base"[^>]*>([\s\S]*?)<\/pre>/)[1].split("\n");
  assert.equal((about.match(/class="flower-branch flower-(?:left|center|right)"/g) ?? []).length, 3);
  assert.equal((about.match(/<pre class="flower-petals">/g) ?? []).length, 2);
  assert.equal((about.match(/class="flower-crown"/g) ?? []).length, 1);
  assert.doesNotMatch(about, /flower-rest|flower-grown/);
  assert.equal(base.length, 6);
  assert.equal(base[3], "   ___\\__|__/___");
  assert.ok(about.includes('class="plant-butterfly" aria-hidden="true"'));
  assert.ok(about.includes("<span><i>()</i>|<i>()</i></span>"));
  assert.ok(about.includes('class="flower-bud">.-.\n\\_/</pre>'));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /\.window-objects \{[^}]*padding: 14px 5ch 0/);
  assert.ok(css.includes('.flower-crown { transform: translateY(-1.4em); }'));
  assert.ok(css.includes('.flower-left .flower-tip { transform: translate(-0.9ch, -0.7em) rotate(-8deg); }'));
  assert.ok(css.includes('.flower-right .flower-tip { transform: translate(0.9ch, -0.9em) rotate(8deg); }'));
  assert.ok(css.includes("transition: transform 950ms cubic-bezier"));
  assert.match(css, /\.flower-base \{ top: 9\.8em; \}/);
  assert.match(css, /\.flower-trigger \{ width: 18ch; height: 18\.2em;/);
  assert.match(css, /\.work-art \.scene-trigger \{ align-self: center; font: 12px\/1\.35 var\(--mono\); \}/);
  assert.ok(home.includes("      '-'-</pre>"));
  assert.match(css, /\.thinking-chair-art \{ transform-origin: 50% 95%; \}/);
  assert.doesNotMatch(css, /animation:\s*(?:chair-rock|cup-curl|bird-blink|ember-rise)[^;}]*infinite/);
  const script = await fetch(`${origin}/scene-details.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /javascript/);
  assert.doesNotMatch(await script.text(), /requestAnimationFrame|setInterval|AudioContext|fetch\(/);
  const theme = await (await fetch(`${origin}/theme.css`)).text();
  assert.match(theme, /:is\([^}]*\.window-objects[^}]*\) \{ color: #adb998; \}/);
  assert.ok(theme.includes('.hearth-embers { color: #efb86a; }'));
});

test("project cards consistently place organization above the title and date/role/links in the metadata row", async () => {
  const dates = { mai: "2025-07", stashbird: "2026-09", graphrag: "2026-04", staccato: "2025-11" };
  const roles = { mai: "software engineer / infrastructure / evaluation / post-training", stashbird: "co-author", graphrag: "co-author", staccato: "team member" };
  for (const path of ["/", "/links"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    const cards = path === "/"
      ? [...html.matchAll(/<article class="work-item" data-work="([^"]+)">([\s\S]*?)<\/article>/g)]
      : [...html.matchAll(/<li class="public-link-entry"[^>]*data-work="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)];
    for (const [id, date] of Object.entries(dates)) {
      const card = cards.find(match => match[1] === id)?.[2];
      assert.ok(card, `Missing ${id} on ${path}`);
      const eyebrow = card.match(/<div class="eyebrow">([\s\S]*?)<\/div>/)[1];
      assert.doesNotMatch(eyebrow, /<time|datetime=/);
      assert.match(eyebrow, /Microsoft/);
      const metadata = card.match(/<div class="work-links">([\s\S]*?)<\/div>/)[1];
      assert.ok(metadata.includes(`datetime="${date}"`));
      assert.ok(metadata.includes(roles[id]));
      assert.ok(metadata.indexOf("<time") < metadata.indexOf(roles[id]));
      if (metadata.includes("<a ")) assert.ok(metadata.indexOf(roles[id]) < metadata.indexOf("<a "));
      assert.ok(card.indexOf('class="eyebrow"') < card.indexOf("<h3>"));
      assert.ok(card.indexOf('class="work-links"') > card.indexOf("</h3>"));
      if (id === "mai") assert.ok(!metadata.includes("<a "));
    }
  }
});

test("all four ASCII project controls are centered and use finite manual animations independent of rain", async () => {
  const html = await (await fetch(origin)).text();
  for (const kind of ["agent", "bird", "graph", "speech"]) assert.ok(html.includes(`data-scene-detail="${kind}"`));
  assert.ok(html.includes('class="bird-wing"'));
  assert.equal((html.match(/class="graph-frame graph-/g) ?? []).length, 4);
  assert.ok(html.includes('class="speech-bars" aria-hidden="true"'));
  assert.ok(html.includes('class="check-run"'));
  assert.ok(html.includes('class="check-test"'));
  assert.ok(html.includes('class="check-learn"'));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  for (const animation of ["object-jiggle", "bird-flap", "checklist-run", "checklist-test", "checklist-learn", "graph-snip", "graph-prune", "graph-rewire", "speech-pass"]) {
    assert.ok(css.includes(`@keyframes ${animation}`));
  }
  assert.doesNotMatch(css, /\[data-rain[^\]]*\][^{]*\.(?:flower-trigger|bird-trigger|agent-trigger|graph-trigger|speech-trigger|teacup-trigger|plant-trigger)/);
});

test("the project animations contain the complete checklist, wing outline and genuinely changed graph topologies", async () => {
  const html = (await (await fetch(origin)).text()).replace(/\r\n/g, "\n");
  assert.match(html, /\[<span class="check-run">x<\/span>\] run/);
  assert.match(html, /\[<span class="check-test">x<\/span>\] test/);
  assert.match(html, /\[<span class="check-learn">x<\/span>\] learn/);
  const wing = html.match(/<pre class="bird-wing">([\s\S]*?)<\/pre>/)[1];
  assert.deepEqual(wing.split("\n"), [" .-.", "/  /", "'--'"]);
  const frames = [...html.matchAll(/<pre class="graph-frame [^"]+" data-graph-phase="([^"]+)">([\s\S]*?)<\/pre>/g)];
  assert.deepEqual(frames.map(frame => frame[1]), ["original", "snip", "prune", "rewire"]);
  for (const [, , art] of frames) {
    assert.equal(art.split("\n").length, 7);
    assert.ok(art.split("\n").every(row => row.length <= 12));
    assert.match(art, /^[\x20-\x7e\n]+$/);
  }
  const [original, snip, prune, rewire] = frames.map(frame => frame[2].split("\n"));
  assert.deepEqual(original, [
    "   o --- o",
    "  / \\     \\",
    " o   o --- o",
    "  \\ / \\   /",
    "   o   o-o",
    "    \\ /",
    "     o",
  ]);
  assert.equal(snip[0], "   o  x  o");
  assert.equal((original.join("").match(/o/g) ?? []).length, 9);
  assert.equal((prune.join("").match(/o/g) ?? []).length, 8);
  assert.equal((rewire.join("").match(/o/g) ?? []).length, 9);
  assert.equal(prune[0], "   o");
  assert.equal(prune[1], "  / \\");
  assert.equal(rewire[0], "   o     o");
  assert.equal(rewire[2], " o   o --+-o");
  assert.equal(rewire[1][9], "|");
  assert.equal(rewire[3][9], "|");
  const nodePositions = rows => rows.flatMap((row, y) => [...row].flatMap((character, x) => character === "o" ? [`${x},${y}`] : []));
  assert.deepEqual(nodePositions(snip), nodePositions(original));
  assert.deepEqual(nodePositions(rewire), nodePositions(original));
  assert.deepEqual(nodePositions(prune), nodePositions(original).filter(position => position !== "9,0"));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.doesNotMatch(css, /graph-cluster|nodes-shift|nodes-return|test-clear|run-check/);
  assert.match(css, /\.bird-stage \.bird-wing \{[^}]*position: absolute;[^}]*transform-origin: 85% 15%/);
  assert.match(css, /\.graph-stage \{[^}]*width: 12ch; height: 9\.45em/);
});

test("the microphone silhouette is symmetric inside a centered nine-character stage", async () => {
  const html = (await (await fetch(origin)).text()).replace(/\r\n/g, "\n");
  const art = html.match(/<pre class="speech-mic" aria-hidden="true">([\s\S]*?)<\/pre>/)[1].split("\n");
  assert.deepEqual(art, ["  .---.", "  |:::|", " (|:::|)", "  '---'", "    |", " ___|___"]);
  const centered = art.map(row => {
    const first = row.search(/\S/);
    const last = row.trimEnd().length - 1;
    return (first + last + 1) / 2;
  });
  assert.ok(centered.every(center => center === 4.5));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /\.speech-trigger \.speech-mic \{ width: 9ch; margin-inline: auto; font: inherit; \}/);
  assert.match(css, /\.speech-bars \{[^}]*font: inherit;/);
});
test("About keeps a single static portrait without bookshelf or carousel previews", async () => {
  const html = await (await fetch(`${origin}/about`)).text();
  assert.equal((html.match(/class="picture-photo"/g) ?? []).length, 1);
  assert.ok(html.includes("<figcaption>a moment, framed.</figcaption>"));
  assert.doesNotMatch(html, /bookshelf|shelf-book|data-picture-|picture-controls|picture-postcard/);
  const module = await fetch(`${origin}/about-room.js`);
  assert.equal(module.status, 404);
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.doesNotMatch(css, /bookshelf|shelf-book|picture-swivel|picture-controls|picture-postcard/);
});

test("the dangling contact sheet uses labeled empty photo slots without replacing the portrait", async () => {
  const html = await (await fetch(`${origin}/about`)).text();
  assert.equal((html.match(/class="picture-photo"/g) ?? []).length, 1);
  assert.ok(html.includes('class="photo-sheet-toggle" type="button" aria-expanded="false" aria-pressed="false"'));
  assert.ok(html.includes('aria-label="Open the contact sheet preview" hidden'));
  assert.ok(html.includes('id="photo-sheet-panel" aria-label="Contact sheet preview" hidden'));
  assert.equal((html.match(/data-photo-frame/g) ?? []).length, 3);
  assert.equal((html.match(/data-photo-select="/g) ?? []).length, 3);
  assert.equal((html.match(/not a photograph/g) ?? []).length, 3);
  assert.doesNotMatch(html, /preview slots|class="photo-sheet-note"|class="photo-sheet-close"/);
  const module = await fetch(`${origin}/photo-sheet.js`);
  assert.equal(module.status, 200);
  assert.match(module.headers.get("content-type"), /javascript/);
  assert.doesNotMatch(await module.text(), /fetch\(|localStorage|sessionStorage|AudioContext|setInterval|requestAnimationFrame/);
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /\.photo-sheet-panel \{[^}]*max-height:[^}]*overflow: auto;/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) and \(forced-colors: none\) \{[\s\S]*?\.photo-sheet-toggle \{ transition: transform 250ms ease; \}/);
  assert.match(css, /\.photo-sheet-panel \{ position: fixed;[^}]*left: 20px; right: 20px;/);
});

test("portrait glass has a separate finite reflection control without moving the photograph or opening the sheet", async () => {
  const html = await (await fetch(`${origin}/about`)).text();
  assert.ok(html.includes('data-scene-detail="portrait" aria-label="Catch a little light on the portrait glass" disabled'));
  assert.ok(html.includes('class="portrait-glass" aria-hidden="true"'));
  assert.equal((html.match(/class="picture-photo"/g) ?? []).length, 1);
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /\.picture-art \.portrait-trigger \{[^}]*position: absolute;[^}]*width: max\(44px, 16ch\)/);
  assert.match(css, /\.portrait-glass \{[^}]*overflow: hidden;[^}]*pointer-events: none/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) and \(forced-colors: none\) \{\s*\.portrait-trigger\[data-detail-state="playing"\]/);
  assert.match(css, /@keyframes portrait-glint/);
  assert.doesNotMatch(css, /animation: portrait-glint[^;}]*infinite/);
  const theme = await (await fetch(`${origin}/theme.css`)).text();
  assert.match(theme, /:root\[data-theme="lamplight"\] \.portrait-glass \{ --portrait-glint:/);
});

test("collapsible field notes have centered reading panels with passive mist behind crisp prose", async () => {
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /\.work-story \{[^}]*isolation: isolate;[^}]*border: 1px solid var\(--note-line\);[^}]*background: var\(--note-paper\)/);
  assert.match(css, /\.work-story > \.story-copy \{ width: calc\(100% - 40px\); margin: 22px auto 24px; text-align: left; \}/);
  assert.match(css, /\.note-mist \{[^}]*z-index: -1;[^}]*opacity: 0\.75;[^}]*pointer-events: none/);
  assert.doesNotMatch(css, /\.work-story \{[^}]*\bopacity:|\.story-copy \{[^}]*(?:filter|opacity):/);
  assert.match(css, /\.work-story > \.story-copy \{ width: calc\(100% - 24px\); margin-block: 18px; \}/);
  assert.match(css, /\.work-story \.story-aside \{ max-width: 54ch; margin: 26px auto;/);
  const theme = await (await fetch(`${origin}/theme.css`)).text();
  const saturation = rgb => {
    const low = Math.min(...rgb) / 255, high = Math.max(...rgb) / 255;
    return high === low ? 0 : (high - low) / (1 - Math.abs(high + low - 1));
  };
  for (const palette of [css, theme]) {
    const paper = palette.match(/--note-paper: #(..)(..)(..);/).slice(1).map(value => parseInt(value, 16));
    const banner = palette.match(/--glass-fog-rgb: ([\d, ]+);/)[1].split(",").map(Number);
    const colors = [paper, ...["fog", "light", "dew"].map(name => palette.match(new RegExp(`--note-${name}-rgb: ([\\d, ]+);`))[1].split(",").map(Number))];
    for (const color of colors) {
      assert.ok(color[1] > color[0] && color[1] > color[2], "note surfaces and droplets must stay sage, not warm red");
      assert.ok(saturation(color) < saturation(banner), "note palette must be less saturated than the banner");
    }
  }
  const note = await (await fetch(`${origin}/notes/evaluation`)).text();
  assert.ok(!note.includes('class="work-story"'));
});

test("Stashbird next-test stays prospective and CorpGen references stay research-focused", async () => {
  const html = await (await fetch(`${origin}/links`)).text();
  const story = html.match(/<details class="work-story" id="stashbird-case-study">([\s\S]*?)<\/details>/)[1];
  assert.ok(story.includes("<h4>What I'd test next</h4>"));
  assert.ok(story.includes("<h4>Research that shapes the question</h4>"));
  assert.ok(story.indexOf("What I'd test next") > story.indexOf("I co-authored Stashbird."));
  assert.ok(story.indexOf("What I'd test next") < story.indexOf("I want memory that leaves room for a conversation to change."));
  assert.ok(story.includes("This is a proposed experiment, not a result from the Stashbird paper."));
  assert.ok(story.includes("compare against no memory and an authoritative current-state reference"));
  assert.ok(story.includes('href="https://arxiv.org/abs/2602.14229"'));
  assert.ok(story.includes('href="https://arxiv.org/html/2602.14229v1"'));
  assert.ok(story.includes('class="story-sources story-reading">Related reading:'));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /\.story-copy \.story-reading \{ margin-inline-start: 20px; \}/);
  assert.match(css, /\.story-copy \.story-reading \{ margin-inline-start: 14px; \}/);
  assert.ok(story.includes("memory interference and changing dependencies across interleaved tasks"));
  assert.ok(story.includes("reuse of verified demonstrations"));
  assert.doesNotMatch(story, /Chidera Biringa|co-authored by|influence I've spent time with|I didn't co-author CorpGen|not claiming it shaped|questions I'd pursue next|not project credit/);
  assert.ok(story.includes("preliminary artifact-versus-trace evaluation observation, separate from its main experiments"));
  const home = await (await fetch(origin)).text();
  assert.ok(!home.includes("CorpGen") && !home.includes("What I'd test next"));
});
test("Cantor is mentioned without linking or publishing the supplied essay", async () => {
  const html = await (await fetch(`${origin}/about.html`)).text();
  assert.ok(html.includes("my archival art volunteering at stanford's cantor arts center,"));
  assert.ok(!html.includes("rodin centre"));
  assert.ok(!/<a\b[^>]*>[^<]*(?:Rodin|Stanford|Cantor)/i.test(html));
  assert.ok(!html.includes("Rodin_ The Nonconformist") && !html.includes("docs/Misc") && !html.includes("docs\\Misc"));
  const response = await fetch(`${origin}/Rodin_%20The%20Nonconformist%20and%20His%20Lasting%20Legacies.pdf`);
  assert.equal(response.status, 404);
  const graph = await (await fetch(`${origin}/graph-model.js`)).text();
  assert.ok(graph.includes("Stanford's Cantor Arts Center"));
  assert.ok(!graph.includes("MAIDAP") && !graph.includes('"Stash"'));
});

test("the full About story is a public page, while home ends with a roofed fireplace and link", async () => {
  const response = await fetch(`${origin}/about.html`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.equal(await (await fetch(`${origin}/about`)).text(), html);
  const head = await fetch(`${origin}/about.html`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.ok(html.includes('<h1 id="about-heading">Outside the brackets</h1>'));
  assert.ok(html.includes('href="about.html" aria-current="page"'));
  assert.ok(html.includes('class="about-main"'));
  assert.ok(html.includes('href="index.html#play"') && html.includes('href="links.html"'));
  assert.ok(html.includes('src="garden.js"') && !html.includes('src="graph.js"'));
  const home = await (await fetch(origin)).text();
  assert.ok(home.includes('class="home-hearth house-shelter" id="about"'));
  assert.ok(home.includes('class="hearth-about-link" href="about.html"'));
  for (const name of ["sidequest-path", "house-furniture", "picture-frame", "about-garden"]) {
    assert.ok(!home.includes(`class="${name}"`), name);
  }
});

test("the fireplace companions are ordinary accessible Spotify and email links", async () => {
  const html = await (await fetch(origin)).text();
  const row = html.slice(html.indexOf('class="hearth-companions"'), html.indexOf("</main>"));
  assert.ok(row.indexOf('class="hearth-object record-player"') < row.indexOf('class="hearth"'));
  assert.ok(row.indexOf('class="hearth"') < row.indexOf('class="hearth-object mailbox"'));
  assert.ok(row.includes('href="https://open.spotify.com/user/21nln64qkjniyjcerq3vlx5pi"'));
  assert.ok(row.includes('aria-label="On my turntable: my Spotify profile"'));
  assert.ok(row.includes('href="mailto:nicholasyiofficial@gmail.com"'));
  assert.ok(row.includes('aria-label="Leave a little note: send me an email"'));
  assert.equal((row.match(/<pre class="(?:record-art|mailbox-art)" aria-hidden="true">/g) || []).length, 2);
  assert.ok(row.includes('class="spotify-preview"'));
  assert.ok(!row.includes("?si="));
  assert.ok(html.includes('href="links.html#public-links-heading">More work <span aria-hidden="true">&#8594;</span>'));
  assert.ok(html.includes('href="links.html#field-notes-heading">Field notes'));
  assert.ok(!html.includes("More links, competition results, and earlier experiments"));
});

test("the listening card is an accessible optional disclosure, not a credential-bearing embed", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes('class="record-corner" data-listening'));
  assert.ok(html.includes('aria-controls="listening-card" hidden'));
  assert.ok(html.includes('class="listening-card" id="listening-card" aria-label="My Spotify listening" hidden'));
  const cardMarkup = html.slice(html.indexOf('<section class="listening-card"'), html.indexOf("</section>", html.indexOf('<section class="listening-card"')));
  assert.ok(cardMarkup.includes('class="spotify-preview-toggle"') && cardMarkup.includes('class="spotify-preview"'));
  assert.ok(cardMarkup.includes('class="recent-shelf" aria-labelledby="recent-records-heading" hidden'));
  assert.ok(cardMarkup.includes('id="recent-records-heading">Recently on the turntable'));
  assert.ok(cardMarkup.includes('class="recent-records"'));
  assert.ok(!cardMarkup.includes('allow="autoplay'));
  assert.ok(html.includes('data-listening-status role="status"'));
  assert.ok(html.includes('width="80" height="80" alt="" referrerpolicy="no-referrer"'));
  assert.ok(!html.includes("refreshToken") && !html.includes("client_secret"));
  const script = await fetch(`${origin}/listening.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /javascript/);
  const response = await fetch(`${origin}/api/listening`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "not_connected" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await fetch(`${origin}/.spotify-auth.json`)).status, 404);
  assert.equal((await fetch(`${origin}/worker.mjs`)).status, 404);
  assert.equal((await fetch(`${origin}/spotify.mjs`)).status, 404);
  assert.equal((await fetch(`${origin}/scripts/spotify-connect.mjs`)).status, 404);
  const config = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(config, /"main"\s*:\s*"worker\.mjs"/);
  assert.match(config, /"binding"\s*:\s*"ASSETS"/);
  assert.match(config, /"run_worker_first"\s*:\s*\[\s*"\/api\/listening"\s*,?\s*\]/);
  const ignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  assert.ok(ignore.includes(".spotify-auth.json"));
});

test("sharing metadata uses canonical production URLs and a genuine 1200-by-630 PNG", async () => {
  for (const [path, canonical] of [["/", ""], ["/about.html", "about"], ["/links.html", "links"], ["/notes/evaluation", "notes/evaluation"]]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    assert.ok(html.includes(`rel="canonical" href="https://nicholasyi.me/${canonical}"`));
    assert.ok(html.includes(`property="og:url" content="https://nicholasyi.me/${canonical}"`));
    for (const tag of ["og:title", "og:description", "og:site_name", "og:image:alt"]) {
      assert.match(html, new RegExp(`property="${tag}" content="[^"]+"`));
    }
    assert.ok(html.includes('property="og:image" content="https://nicholasyi.me/social-card.png"'));
    assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
    assert.ok(html.includes('name="twitter:image" content="https://nicholasyi.me/social-card.png"'));
    assert.ok(html.includes('name="twitter:image:alt"'));
    assert.ok(html.includes('property="og:image:width" content="1200"'));
    assert.ok(html.includes('property="og:image:height" content="630"'));
  }
  const response = await fetch(`${origin}/social-card.png`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const png = Buffer.from(await response.arrayBuffer());
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  const head = await fetch(`${origin}/social-card.png`, { method: "HEAD" });
  assert.equal(Number(head.headers.get("content-length")), png.length);
  assert.equal(await head.text(), "");
});

test("missing URLs serve the roofed 404 with root-relative recovery links, never a success fallback", async () => {
  for (const path of ["/404.html", "/404", "/unknown", "/deeply/nested/missing?test=1"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.ok(html.includes('<meta name="robots" content="noindex">'));
    assert.ok(html.includes("<h1>A little off the path.</h1>"));
    assert.ok(html.includes('href="/index.html">Back home'));
    assert.ok(html.includes('href="/styles.css"') && html.includes('src="/garden.js"'));
    assert.ok(html.includes('class="house-roof"') && html.includes('class="house-body"'));
    assert.ok(html.includes('class="hearth" role="group"'));
    assert.ok(html.includes('<main id="main" class="error-main" tabindex="-1">'));
    assert.ok(!html.includes("deeply/nested/missing"));
    const head = await fetch(`${origin}${path}`, { method: "HEAD" });
    assert.equal(head.status, 404);
    assert.equal(Number(head.headers.get("content-length")), Buffer.byteLength(html));
    assert.equal(await head.text(), "");
  }
  const config = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.ok(config.includes('"not_found_handling": "404-page"'));
});

test("accepted writing replaces the review prototype without changing note routes", async () => {
  const ordinary = await (await fetch(`${origin}/links`)).text();
  const formerReview = await (await fetch(`${origin}/links?review=writing#writing-review`)).text();
  assert.equal(formerReview, ordinary);
  assert.doesNotMatch(ordinary, /writing-review\.js|writing-originals\.json/);
  for (const path of ["/writing-review.js", "/writing-originals.json"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.equal((await fetch(`${origin}${path}`, { method: "HEAD" })).status, 404);
  }
});

test("only public assets are served and unsupported methods are explicit", async () => {
  for (const path of ["/server.mjs", "/package.json", "/README.md", "/%2e%2e/server.mjs", "/unknown"]) {
    assert.equal((await fetch(`${origin}${path}`)).status, 404);
  }
  const post = await fetch(origin, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  assert.equal((await fetch(`${origin}/styles.css?v=1`)).status, 200);
});

test("case study and field note are native collapsed disclosures on Links, not extra homepage copy", async () => {
  const html = await (await fetch(`${origin}/links.html`)).text();
  const stories = [...html.matchAll(/<details class="work-story" id="([^"]+)">([\s\S]*?)<\/details>/g)];
  assert.deepEqual(stories.map(story => story[1]), ["stashbird-case-study", "evaluation-field-note"]);
  for (const [, , content] of stories) {
    assert.match(content, /<summary>[\s\S]*?<strong>[^<]+<\/strong>[\s\S]*?<span>[^<]+<\/span>[\s\S]*?<\/summary>/);
    assert.ok(content.includes('class="story-copy"'));
  }
  assert.ok(html.includes('href="#evaluation-field-note"'));
  assert.ok(html.includes('href="#stashbird-case-study"'));
  assert.ok(html.includes('href="https://arxiv.org/html/2609.34242v2"'));
  const note = await (await fetch(`${origin}/notes/evaluation`)).text();
  assert.ok(note.includes('href="https://arxiv.org/html/2609.34242v2#S3"'));
  assert.ok(!html.includes("rotation"));
  assert.ok(html.includes("I co-authored Stashbird."));
  assert.ok(html.includes("owning evaluation across memory systems and benchmarks"));
  assert.ok(html.includes("This is a team project; the method described here comes from our co-authored paper."));
  for (const forbidden of ["76.4", "planned organization-wide", "phone number", "5,000"]) assert.ok(!stories.some(story => story[2].includes(forbidden)));
  const home = await (await fetch(origin)).text();
  assert.ok(!home.includes("work-story") && !home.includes("Thinking out loud"));
  assert.ok(!home.includes("When a conversation changes"));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.ok(css.includes(".work-story > summary:focus-visible"));
  assert.ok(css.includes(".story-copy { max-width: 65ch;"));
});

test("education is a compact accurate About block, never a new homepage section", async () => {
  const about = await (await fetch(`${origin}/about.html`)).text();
  const education = about.match(/<p class="about-education">([\s\S]*?)<\/p>/)[1];
  assert.ok(education.includes('href="https://www.cmu.edu/">Carnegie Mellon University'));
  assert.ok(education.includes('class="education-years">2021&ndash;2025'));
  assert.ok(education.includes("B.S. in Computer Science (Artificial Intelligence) &amp; Business Administration"));
  assert.ok(about.indexOf('class="about-education"') > about.indexOf('class="sidequest-conclusion"'));
  assert.ok(about.indexOf('class="about-education"') < about.indexOf('class="house-furniture"'));
  const home = await (await fetch(origin)).text();
  assert.ok(!home.includes("Carnegie Mellon") && !home.includes("about-education"));
});

test("homepage metadata adds professional context and the public identities use matching link styles", async () => {
  const home = await (await fetch(origin)).text();
  assert.ok(home.includes("<title>Nicholas Yi &mdash; Software Engineer at Microsoft AI</title>"));
  assert.ok(home.includes('property="og:title" content="Nicholas Yi &mdash; Software Engineer at Microsoft AI"'));
  assert.ok(home.includes('Building things that learn,<br class="desktop-break"> remember, and work.'));
  for (const copy of [
    home.match(/<meta name="description" content="([^"]+)"/)[1],
    home.match(/<div class="intro-copy">([\s\S]*?)<\/div>/)[1],
  ]) {
    assert.ok(copy.includes("working on agents, evaluation, and research infrastructure."));
    assert.ok(!copy.includes("post-training"));
  }
  assert.ok(home.includes("I'm interested in how agents remember, how we know they're getting better, and what it takes to make research useful in the real world."));
  for (const path of ["/", "/links"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    const socials = html.match(/<ul class="social-links"[\s\S]*?<\/ul>/)[0];
    assert.ok(socials.includes('href="https://www.linkedin.com/in/nicholasyiofficial/"'));
    assert.ok(socials.includes('href="https://github.com/nicholas-yi">github <span aria-hidden="true">&#8599;</span>'));
    assert.ok(socials.indexOf("linkedin") < socials.indexOf("github"));
  }
});

test("About exposes a truthful ProfilePage with one stable Person identity and no invented statistics", async () => {
  const html = await (await fetch(`${origin}/about`)).text();
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  const schema = JSON.parse(scripts[0][1]);
  assert.deepEqual(schema, {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": "https://nicholasyi.me/about#profile",
    url: "https://nicholasyi.me/about",
    mainEntity: {
      "@type": "Person",
      "@id": "https://nicholasyi.me/#nicholas-yi",
      name: "Nicholas Yi",
      url: "https://nicholasyi.me/",
      image: "https://nicholasyi.me/about-photo.jpg",
      sameAs: ["https://www.linkedin.com/in/nicholasyiofficial/", "https://github.com/nicholas-yi"],
    },
  });
  assert.ok(html.includes('alt="Nicholas Yi."'));
  assert.equal((await fetch(`${origin}/about-photo.jpg`)).status, 200);
});

test("the sitemap lists only unique successful canonical pages and robots advertises it", async () => {
  const response = await fetch(`${origin}/sitemap.xml`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/xml; charset=utf-8");
  const xml = await response.text();
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">[\s\S]*<\/urlset>\s*$/);
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(locations, [
    "https://nicholasyi.me/",
    "https://nicholasyi.me/about",
    "https://nicholasyi.me/links",
    "https://nicholasyi.me/notes/evaluation",
  ]);
  assert.equal(new Set(locations).size, locations.length);
  assert.equal((xml.match(/<url>/g) ?? []).length, locations.length);
  assert.doesNotMatch(xml, /\.html|404|<lastmod>|<priority>|<changefreq>|127\.0\.0\.1/);
  for (const location of locations) {
    const url = new URL(location);
    assert.equal(url.hash, "");
    assert.equal(url.search, "");
    const page = await fetch(`${origin}${url.pathname}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes(`rel="canonical" href="${location}"`));
    assert.doesNotMatch(html, /<meta name="robots" content="[^"]*noindex/);
  }
  const robots = await fetch(`${origin}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.equal(robots.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.deepEqual((await robots.text()).trim().split(/\r?\n/).filter(Boolean), [
    "User-agent: *", "Allow: /", "Sitemap: https://nicholasyi.me/sitemap.xml",
  ]);
  for (const path of ["/sitemap.xml", "/robots.txt"]) {
    const get = await fetch(`${origin}${path}`);
    const head = await fetch(`${origin}${path}`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-type"), get.headers.get("content-type"));
    assert.equal(Number(head.headers.get("content-length")), Buffer.byteLength(await get.text()));
    assert.equal(await head.text(), "");
  }
});

test("the standalone evaluation note is readable without script and keeps nested routes and legacy entries working", async () => {
  const response = await fetch(`${origin}/notes/evaluation`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.ok(html.includes('<h1 id="note-heading">What makes an evaluation trustworthy?</h1>'));
  assert.ok(html.includes('article aria-labelledby="note-heading"'));
  assert.ok(html.includes('href="/about">Nicholas Yi</a>'));
  assert.ok(html.includes("<h2>What actually happened?</h2>"));
  assert.ok(html.includes("<h2>What did the test ask?</h2>"));
  assert.ok(html.includes("Keeping that distinction does not mean making the inconvenient attempts disappear."));
  assert.ok(html.includes("the ability to answer does not establish that the underlying state has been revised correctly."));
  assert.ok(html.includes('href="/links#stashbird-case-study"'));
  assert.ok(html.includes('href="/links#evaluation-field-note"'));
  assert.ok(html.includes('href="https://arxiv.org/html/2609.34242v2#S3"'));
  assert.doesNotMatch(html, /<details|autoplay|bookshelf|data-picture-/);
  assert.ok(!html.includes('class="hearth"'));
  const garden = await (await fetch(`${origin}/garden.js`)).text();
  assert.match(garden, /fireplaceAmount = fireplace\s*\? fireplaceProximity\([^\n]+\)\s*: 0;/);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:https?:|data:|#)/.test(target)) continue;
    assert.ok(target.startsWith("/"), `Nested note asset/link must be root-relative: ${target}`);
    assert.equal((await fetch(new URL(target, `${origin}/notes/evaluation`))).status, 200);
  }
  const alias = await fetch(`${origin}/notes/evaluation.html`);
  assert.equal(alias.status, 200);
  assert.equal(await alias.text(), html);
  const head = await fetch(`${origin}/notes/evaluation`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const links = await (await fetch(`${origin}/links#evaluation-field-note`)).text();
  const entry = links.match(/<details class="work-story" id="evaluation-field-note">([\s\S]*?)<\/details>/)[1];
  assert.doesNotMatch(entry, /data-copy-note|copy-status/);
  assert.ok(entry.includes('href="/notes/evaluation"'));
  assert.ok(entry.includes("A better score is reassuring."));
  assert.ok(!entry.includes("What actually happened?"));
});
