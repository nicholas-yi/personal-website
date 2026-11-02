import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createSiteServer } from "../server.mjs";
import { INK_PALETTE } from "../public/graph-model.js";
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
    assert.ok((await resource.text()).length > 500);
  }
});

test("wisps use compositor-friendly drift instead of changing shape and blurred filters every frame", async () => {
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.ok(css.includes("@keyframes thought-drift"));
  assert.ok(css.includes(".thought-bubble:is(:hover, :focus-within) .thought-wisp"));
  assert.match(css, /@keyframes thought-drift \{[^}]*opacity: 0\.22; transform:/);
  const thoughts = await (await fetch(`${origin}/thoughts.js`)).text();
  assert.ok(!thoughts.includes("style.borderRadius"));
  const garden = await (await fetch(`${origin}/garden.js`)).text();
  assert.ok(garden.includes("if (layoutNeedsUpdate)"));
  assert.ok(garden.includes('element.closest(".house-body, .work-art, [data-graph-playground]'));
  assert.ok(garden.includes("sceneGeometry.rectangles.map(viewportRect)"));
  assert.ok(garden.includes("rainGlyphs.draw(context, text, x, y)"));
  assert.ok(!css.match(/backdrop-filter:\s*blur/));
  assert.equal((await fetch(`${origin}/rain-glyphs.js`)).status, 200);
});

test("mailbox approach and departure are local decorative behavior without intercepting the email link", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes('class="mailbox-art" aria-hidden="true"><span class="perching-mail"'));
  const source = await (await fetch(`${origin}/mailbox.js`)).text();
  assert.ok(source.includes('mailbox.addEventListener("pointerenter"'));
  assert.ok(source.includes('mailbox.addEventListener("focusin"'));
  assert.ok(source.includes('setPhase("perched")'));
  assert.ok(source.includes('setPhase("departing")'));
  assert.ok(!source.includes("preventDefault"));
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
  assert.ok(html.includes('class="garden-controls" aria-label="Rain settings" hidden'));
  assert.ok(html.includes('<canvas id="garden" aria-hidden="true">'));
  assert.ok(!html.includes("<audio") && !html.includes("autoplay"));
});

test("sound defaults on but starts only after a trusted intentional gesture", async () => {
  for (const path of ["/", "/about.html", "/links.html", "/404.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    assert.ok(html.includes('<button id="sound-toggle" type="button" aria-pressed="true" aria-label="Mute sound"'));
    assert.ok(html.includes('<span id="sound-label" class="sr-only">sound on</span>'));
    assert.ok(!html.includes("autoplay"));
  }
  const garden = await (await fetch(`${origin}/garden.js`)).text();
  assert.ok(garden.includes("let soundEnabled = true;"));
  assert.ok(garden.includes("let soundAwaitingGesture = true;"));
  assert.ok(garden.includes('document.addEventListener("pointerdown", startDefaultSound, true)'));
  assert.ok(garden.includes('document.addEventListener("keydown", startDefaultSound, true)'));
  assert.ok(garden.includes('!event.isTrusted') && garden.includes('event.target.closest("#sound-toggle")'));
  assert.ok(garden.includes('!["Enter", " "].includes(event.key)'));
  assert.ok(garden.includes("if (enabled) soundEnabled = false;"));
});

test("the public README preserves the supplied wording except the approved recording credits", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.equal(readme.replace(/\r\n/g, "\n"), `# nicholasyi.me

my little corner of the internet → **[nicholasyi.me](https://nicholasyi.me)**

it's where i keep my research, writing, and a few things i'm into. it also rains.

## things to poke at

- **the rain** — move your cursor through it and it'll part around you. it drips off the roof and ripples the puddle at the bottom
- **umbrellas** — click to open one. click again to fold it. i always have so many extra ones, feel free to ask me for one...
- **sound** — on by default. click around for more. natural rain and fireplace recordings, with little click sounds made in browser
- **the graph** — connect my interests and see how they're related

no frameworks, no build step, no tracking. just good ole html, css, and js.

## running it

    npm start   # http://127.0.0.1:4173
    npm test

## how it ships

push to \`main\` → tests run → cloudflare deploys it. if a test fails, nothing goes live.

the ascii art, animation, and interaction sounds are original. the rain and fireplace recordings are CC0; see [credits](AUDIO-CREDITS.md). feel free to look around.
`);
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

test("ASCII companion decorations are original, noninteractive, motion-gated, and share art baseline rows", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes('class="record-spindle">()</span>'));
  assert.ok(html.includes('<pre class="record-art" aria-hidden="true"><span class="record-notes">'));
  assert.ok(html.includes('class="record-sleeve"'));
  assert.ok(html.includes('class="winged-mail" aria-hidden="true"'));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.ok(css.includes("grid-template-rows: subgrid"));
  assert.ok(css.includes('.house-furniture .hearth-fire, .hearth-companions .hearth-fire { grid-row: 1 / 2;'));
  for (const animation of ["record-spin", "record-note", "mail-arrival", "mail-wing"]) assert.ok(css.includes(`@keyframes ${animation}`));
  const script = await fetch(`${origin}/hearth.js`);
  assert.equal(script.status, 200);
  const source = await script.text();
  assert.ok(source.includes('visible && !doc.hidden && !reduced.matches'));
  assert.ok(source.includes('dataset.rain === "moving"'));
  const listening = await (await fetch(`${origin}/listening.js`)).text();
  assert.ok(!listening.includes("hearth:motion") && !listening.includes("scheduleSurprise"));
  assert.ok(listening.includes('status.setAttribute("aria-live", "polite")'));
});

test("all pages use the same simple navigation without the removed notes destination", async () => {
  for (const path of ["/", "/links.html", "/about.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    const nav = html.match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)[1];
    assert.deepEqual([...nav.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map((match) => match[1]), ["work", "play", "about", "links"]);
    assert.ok(!html.includes("#notes") && !html.includes("type-proof"));
  }
  const home = await (await fetch(origin)).text();
  assert.ok(!home.includes("Threads I keep coming back to") && !home.includes('id="notes"'));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /nav \{[^}]*align-items: center/);
  assert.match(css, /nav a \{[^}]*min-width: 44px; min-height: 44px; line-height: 1/);
  assert.ok(!css.includes("proof-mono") && !css.includes("type-proof"));
  assert.ok(css.includes(":focus-visible"));
  assert.ok(css.includes("prefers-reduced-motion"));
});

test("all pages end with document-bottom ASCII puddles and accessible icon-only weather controls", async () => {
  for (const path of ["/", "/about.html", "/links.html", "/404.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    assert.ok(html.includes('class="page-puddles" aria-hidden="true"'));
    assert.ok(html.indexOf('class="page-puddles"') > html.indexOf("</footer>"));
    assert.ok(html.includes('class="control-off"'));
    assert.ok(html.includes('class="sound-muted" d="m3 3 14 14"'));
    assert.ok(html.includes('id="motion-label" class="sr-only"'));
    assert.ok(html.includes('id="sound-label" class="sr-only"'));
    assert.ok(html.includes('aria-label="Mute sound"') && html.includes('aria-label="Enable rain animation"'));
  }
  const response = await fetch(`${origin}/puddles.js`);
  assert.equal(response.status, 200);
  const garden = await (await fetch(`${origin}/garden.js`)).text();
  assert.ok(garden.includes("overlapsIndexedText(textIndex, x, y)"));
  assert.ok(garden.includes("nextFrameAt = now + 1000 / 24"));
  assert.ok(garden.includes("rain.groundY = water && water.top < innerHeight ? water.top + 55 : rain.height + 16"));
});

test("resume remains an honest placeholder, not a local/private download or a broken link", async () => {
  for (const path of ["/", "/links.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    const socials = html.match(/<ul class="social-links"[\s\S]*?<\/ul>/)[0];
    assert.ok(socials.includes('class="resume-placeholder"'));
    assert.ok(!socials.includes("kaggle") && !socials.includes("C:\\") && !socials.includes("Nicholas_Yi_Evals"));
  }
  assert.equal((await fetch(`${origin}/resume.pdf`)).status, 404);
});

test("the graph keeps its fallback and accessible instructions without redundant idle copy", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes("data-graph-playground"));
  assert.ok(html.includes('class="graph-fallback"'));
  assert.ok(html.includes("Enable JavaScript to connect the dots."));
  assert.ok(!html.includes("See what connects."));
  assert.ok(!html.includes("Hold down and draw through"));
  const graph = await (await fetch(`${origin}/graph.js`)).text();
  assert.ok(!graph.includes("Draw a line, or tap two dots."));
  assert.ok(!graph.includes('"kg-alternate"'));
  assert.ok(!graph.includes("Scroll outside the paper. Esc cancels."));
  assert.ok(!graph.includes('"kg-help"'));
  assert.ok(graph.includes('"Draw through up to three dots, or click or tap two. Keyboard:'));
  assert.ok(graph.includes('plot.setAttribute("aria-describedby", keyboardHelp.id)'));
  assert.ok(graph.includes("On touch screens, swipe outside the paper to scroll."));
  assert.ok(!graph.includes('"kg-instruction"'));
  assert.ok(!graph.includes("Ten dots from my work and life."));
  assert.ok(!graph.includes("Pick a dot.") && !graph.includes("a few things about me"));
  assert.ok(graph.includes('report("ready", "")'));
  assert.ok(graph.includes('status.classList.toggle("kg-sr-only", type === "ready")'));
  assert.ok(graph.includes('status.setAttribute("aria-live", "polite")'));
  const css = await (await fetch(`${origin}/graph.css`)).text();
  assert.ok(css.includes(".kg-status.kg-sr-only { min-height: 0; margin: 0; padding: 0; border: 0; }"));
  assert.ok(!html.includes("All 28 pairs have a little story. Some are facts; some are playful parallels. Your sketch stays in this tab."));
  assert.ok(!html.includes('class="play-footnote"'));
});

test("the larger four-pane window has framing and a weather opening", async () => {
  const html = await (await fetch(origin)).text();
  for (const part of ["window-lintel", "window-opening", "window-mullion", "window-crossbar", "window-sill"]) {
    assert.ok(html.includes(part));
  }
  assert.ok(html.includes('class="intro-content"'));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.ok(css.includes("grid-row: 2"));
  assert.ok(!css.includes(".rain-window { display: none; }"));
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
    "https://github.com/microsoft/Staccato-Stuttered-ASR",
  ]) assert.ok(html.includes(`href="${url}"`), url);
  assert.ok(html.includes("17th out of 293 teams") && html.includes("18th place in Phase 2; 3,000+ participants across the challenge"));
  assert.ok(html.includes("logographic &amp; linguistic OCR"));
  assert.ok(!html.includes("Japanese handwritten"));
  assert.ok(html.includes('aria-label="Stashbird preprint PDF"'));
  assert.ok(html.includes('aria-label="Kuzushiji Recognition final leaderboard"'));
  assert.ok(html.includes('aria-label="Hateful Memes Phase 2 result, nickyi in eighteenth place"'));
  assert.ok(!html.includes("https://patents.google.com/"));
  assert.ok(!html.includes("My Kaggle competitions") && !html.includes("more experiments"));
});

test("header outline preserves the existing padding and the denser decorative scene stays bounded", async () => {
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /\.site-header::before \{[^}]*inset: 8px -12px;[^}]*pointer-events: none/);
  assert.match(css, /\.site-header \{[^}]*padding: 18px 0/);
  assert.ok(css.includes(".record-notes i:nth-child(6)"));
  assert.ok(css.includes("mail-arrival 20s"));
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
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /\.thinking-chair-art \{[^}]*align-self: end;[^}]*font: var\(--object-font\)\/1\.2 var\(--mono\)/);
  assert.ok(!css.includes("transform: scaleX(-1)"));
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
  const source = await script.text();
  assert.ok(source.includes('from "./graph-motion.js"'));
  assert.ok(source.includes("nextFrame = now + 1000 / 30"));
  assert.ok(source.includes('scene.dataset.motion === "moving" && !doc.hidden && !reduced.matches'));
});
test("work preserves chronology and the scoped team award alongside the requested accessibility motivation", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes("Speech recognition designed to better understand people who stutter."));
  assert.ok(html.includes("Team 1st place &#183; Ability Hack Executive Challenge"));
  assert.ok(html.includes("Microsoft Global Hackathon, 2025"));
  assert.ok(html.includes("My brother stutters, so making speech technology more accessible is personal to me."));
  assert.ok(!html.includes("Hypothetical Growth Targets"));
  const cards = [...html.matchAll(/<article class="work-item" data-work="([^"]+)">([\s\S]*?)<\/article>/g)];
  assert.deepEqual(cards.map((card) => card[1]), ["mai", "stashbird", "graphrag", "staccato"]);
  for (const [id, date] of [["mai", "2025-07"], ["stashbird", "2026-09"], ["graphrag", "2026-04"], ["staccato", "2025-11"]]) {
    assert.ok(cards.find((card) => card[1] === id)[2].includes(`datetime="${date}"`));
  }
  assert.ok(cards[1][2].includes("preprint"));
  assert.ok(cards[2][2].includes("article"));
  assert.ok(cards[1][2].includes("Collaborative Apps and Platform (CAP) / Microsoft Teams"));
  assert.ok(!html.includes("first rotation") && !html.includes("previous rotation") && !html.includes("current rotation"));
  assert.ok(html.includes('href="https://www.credly.com/badges/6e507446-96ac-45cc-89e7-e40440959f6c"'));
  const graph = await (await fetch(`${origin}/graph.js`)).text();
  assert.ok(!graph.includes("A little local-only doodle. Nothing is saved or sent."));
  assert.ok(!graph.includes("hold + drag") && !graph.includes("faint lines: existing ties"));
  assert.ok(graph.includes('report("ready", "")'));
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

test("the graph constellation has a separate faint scaffold, not fake committed sketches", async () => {
  const graph = await (await fetch(`${origin}/graph.js`)).text();
  assert.ok(graph.includes('connection.kind === "known"'));
  assert.ok(graph.includes('references.classList.add("kg-reference-edges")'));
  assert.ok(!graph.includes("faint lines: existing ties"));
  const css = await (await fetch(`${origin}/graph.css`)).text();
  assert.ok(css.includes(".kg-reference-edge"));
});

test("the sidequest staircases preserve the user's exact wording and reading order", async () => {
  const html = await (await fetch(`${origin}/about.html`)).text();
  const about = html.slice(html.indexOf('class="about-copy"'), html.indexOf('class="house-furniture"'));
  const paths = [...about.matchAll(/<ul class="sidequest-path" role="list">([\s\S]*?)<\/ul>/g)];
  assert.deepEqual(paths.map((path) => [...path[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((item) => item[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim())), [
    ["a recipe untried,", "a trail less taken,", "a topic unlearned,", "a film unreviewed."],
    [
      "therapeutic shooting at the archery range as an ex-olympic training team usa member,",
      "or my archival art volunteering at stanford's cantor arts center,",
      "or developing film as an aspiring hobbyist photographer,",
      "or engaging with online open-source data communities,",
    ],
  ]);
  assert.ok(about.includes('<p class="sidequest-lead">I write sidequests into my main life journey:</p>'));
  assert.ok(about.includes('<p class="sidequest-lead">so whether it be</p>'));
  assert.ok(!about.includes("sidequest-qualifier"));
  assert.ok(about.includes("<li>therapeutic shooting at the archery range as an ex-olympic training team usa member,</li>"));
  const conclusion = about.match(/<p class="sidequest-conclusion">([\s\S]*?)<\/p>/)[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  assert.equal(conclusion, "I seek to understand the outside world one different lens, or neural layer, at a time");
  assert.ok(about.includes("<span>I seek to understand the outside world</span>"));
  assert.ok(about.includes("<span>one different lens,</span>"));
  assert.ok(about.includes("<span>or neural layer,</span>"));
  assert.ok(about.includes("<span>at a time</span>"));
  assert.ok(!about.includes("Team USA") && !about.includes("an art museum undiscovered"));
  assert.ok(!about.includes("shoooting"));
  assert.ok(!about.includes("developping"));
  assert.ok(!about.includes("or open-sourcing my work and entering online competitions"));
  assert.ok(about.includes("If any of those are your thing"));
  assert.ok(!about.includes("Amazon") && !about.includes("Cisco"));
  assert.ok(!about.includes("One art-history sidequest:"));
  assert.ok(!about.includes("Sometimes, different neural layers."));
  assert.ok(!about.includes("Olympian") && !about.includes("competed in the Olympics"));
  assert.ok(html.includes('class="about-garden"') && html.includes("room to grow."));
  assert.ok(!html.includes("nicholas-yi.png") && !html.includes("line leader"));
  assert.equal((await fetch(`${origin}/nicholas-yi.png`)).status, 404);
});

test("sidequest connections are static decorative CSS, not extra graph controls", async () => {
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.ok(css.includes("--stair-step: clamp("));
  assert.ok(css.includes(".sidequest-path > li:nth-child(4)"));
  assert.ok(css.includes(".sidequest-path > li::before"));
  assert.ok(css.includes(".sidequest-path > li:not(:last-child)::after"));
  assert.ok(css.includes("border-left: 1px solid var(--line); border-bottom: 1px solid var(--line);"));
  assert.match(css, /\.sidequest-conclusion > span \+ span \{[^}]*margin-inline-start: var\(--stair-step\)/);
  assert.ok(css.includes(".sidequest-conclusion > span:nth-child(3)"));
  assert.ok(css.includes(".sidequest-conclusion > span:nth-child(4)"));
  assert.ok(css.includes(".sidequest-conclusion > span::before"));
  assert.ok(css.includes(".sidequest-conclusion > span:not(:last-child)::after"));
});

test("quiet visual polish echoes graph ink without redundant section subtitles", async () => {
  for (const path of ["/", "/links.html", "/about.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    assert.ok(!html.includes('class="section-aside"'));
    assert.ok(!html.includes("a little background") && !html.includes("a few things to follow"));
  }
  const css = await (await fetch(`${origin}/styles.css`)).text();
  for (const color of INK_PALETTE.slice(1, 4)) assert.ok(css.includes(`--thread-ink: ${color}`));
  assert.match(css, /\.hearth-fire \{[^}]*box-shadow: 0 6px 24px #dca25218/);
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
  const umbrella = await (await fetch(`${origin}/umbrella.js`)).text();
  assert.ok(umbrella.includes('view.matchMedia("(hover: hover) and (pointer: fine)")'));
  assert.ok(umbrella.includes('event.pointerType === "touch"'));
  assert.ok(umbrella.includes("p, li, dt, dd, h1, h2, h3"));
  assert.ok(umbrella.includes('[data-graph-playground], .play-section, .house-shelter'));
  assert.ok(umbrella.includes("delete doc.documentElement.dataset.umbrellaCursor"));
  assert.ok(!css.includes("cursor: none"));
});

test("all pages share serif reading type and monospaced utility and ASCII type", async () => {
  for (const path of ["/", "/links.html", "/about.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    assert.ok(html.includes('rel="stylesheet" href="styles.css"'));
  }
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /body \{[^}]*font-family: var\(--serif\)/);
  assert.match(css, /nav \{[^}]*font-family: var\(--mono\)/);
  assert.match(css, /\.sidequest-path \{[^}]*font: inherit/);
  assert.match(css, /\.work-art pre \{[^}]*font-family: var\(--mono\)/);
  assert.ok(!css.includes("--sans") && !css.includes("type-proof"));
});

test("the requested headline and interests stay verbatim, while employer naming and copy are updated", async () => {
  const html = await (await fetch(origin)).text();
  const headline = html.match(/<p class="intro-line">([\s\S]*?)<\/p>/)[1].replace(/<br[^>]*> /, "\n");
  assert.equal(headline, "Building things that learn,\nremember, and work.");
  assert.ok(!html.includes("a small corner of the internet"));
  assert.ok(html.includes("made for a quieter corner of the web."));
  assert.ok(html.includes("<p>I'm interested in how agents remember, how we know they're getting better, and what it takes to make research useful in the real world.</p>"));
  assert.ok(!html.includes("I'm also drawn to accessibility technology, especially speech systems that work better for people who stutter."));
  for (const path of ["/", "/links.html"]) {
    const page = await (await fetch(`${origin}${path}`)).text();
    assert.ok(page.includes('href="https://microsoft.ai/">Microsoft AI Development and Acceleration'));
  }
  for (const copy of [
    "Agent harnesses and evaluation tools for faster research iteration.",
    "Helping conversational agents update their memories as conversations change.",
    "Bringing graph-based code retrieval into VS Code.",
    "Speech recognition designed to better understand people who stutter.",
  ]) assert.ok(html.includes(copy));
  const graph = await (await fetch(`${origin}/graph-model.js`)).text();
  assert.ok(graph.includes('"microsoft", "microsoft"'));
  assert.ok(graph.includes('"staccato", "Staccato / accessibility"'));
  assert.ok(graph.includes('"evaluation", "evaluation"'));
  assert.ok(!graph.includes('"cooking", "cooking"'));
  assert.ok(!graph.includes('"outdoors", "outdoors"'));
  assert.ok(graph.includes('"museums", "art museums"'));
  assert.ok(graph.includes('"opensource", "open source"'));
});

test("all pages have global navigation and a still-usable ASCII fireplace", async () => {
  for (const path of ["/", "/links.html", "/about.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    assert.ok(html.includes('class="site-header"'));
    assert.ok(html.includes('href="about.html"'));
    assert.ok(!html.includes('href="index.html#about"'));
    assert.ok(html.includes('class="hearth" role="img"'));
    assert.ok(html.includes('class="hearth-frame hearth-frame-one"'));
    assert.ok(html.includes("a warm place to end up."));
    assert.equal((html.match(/class="house-roof"/g) || []).length, 1);
    assert.equal((html.match(/class="house-body"/g) || []).length, 1);
    assert.ok(html.indexOf('class="house-roof"') < html.indexOf('class="house-body"'));
    assert.ok(html.indexOf('class="house-body"') < html.indexOf('class="hearth"'));
    assert.ok(/class="[^"]*\bhouse-shelter\b[^"]*"/.test(html));
  }
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.ok(css.includes(".site-header { position: sticky; top: 0;"));
  assert.ok(css.includes('[data-rain] .hearth-frame { animation: none; }'));
});

test("Links is one continuous roofed house with a floor for each discrete milestone", async () => {
  const html = await (await fetch(`${origin}/links.html`)).text();
  assert.ok(html.includes('class="links-house house-shelter"'));
  assert.ok(html.indexOf('class="house-roof"') < html.indexOf("<h1>Links"));
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
  const garden = await (await fetch(`${origin}/garden.js`)).text();
  assert.ok(garden.includes("fireplaceProximity(fireplace, innerHeight, Math.max(0, document.documentElement.scrollHeight - innerHeight - scrollY))"));
  assert.ok(garden.includes('protectedText.push(listeningCard.getBoundingClientRect())'));
  assert.ok(garden.includes('document.querySelectorAll(".page, .listening-card")'));
  assert.ok(garden.includes("audio?.fireplace(fireplaceAmount)"));
  const credits = await readFile(new URL("../AUDIO-CREDITS.md", import.meta.url), "utf8");
  assert.ok(credits.includes("PagDev") && credits.includes("fireplace.mp3"));
});

test("placed umbrellas are focusable, draggable, and protected against synthetic drag clicks", async () => {
  const umbrella = await (await fetch(`${origin}/umbrella.js`)).text();
  assert.ok(umbrella.includes('const art = doc.createElement("button")'));
  assert.ok(umbrella.includes("art.setPointerCapture(event.pointerId)"));
  assert.ok(umbrella.includes('doc.addEventListener("pointerup", endPress, true)'));
  assert.ok(umbrella.includes("if (suppressClick)"));
  assert.ok(umbrella.includes('art.addEventListener("keydown"'));
  const sounds = await (await fetch(`${origin}/interaction-sounds.js`)).text();
  assert.ok(sounds.includes('if (element.closest(".click-umbrella")) return null;'));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /\.click-umbrella \{[^}]*touch-action: none; cursor: grab/);
});
test("graph hover/focus keeps audio sheltered independently of visual rain motion", async () => {
  const garden = await (await fetch(`${origin}/garden.js`)).text();
  assert.ok(garden.includes('graphActivity?.addEventListener("pointerenter"'));
  assert.ok(garden.includes('graphActivity?.addEventListener("pointerleave"'));
  assert.ok(garden.includes('graphActivity?.addEventListener("focusin", applyAudioShelter)'));
  assert.ok(garden.includes("queueMicrotask(applyAudioShelter)"));
  assert.ok(garden.includes("graphHovered || graphActivity?.contains(document.activeElement)"));
  assert.ok(garden.includes("audio?.shelter(graphSheltered ? 1 : motionEnabled ? rain.shelter.strength : 0)"));
  assert.ok(garden.includes('window.addEventListener("blur", releaseInteractionShelter)'));
  assert.ok(!garden.includes("if (soundEnabled) audio?.shelter(rain.shelter.strength)"));
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
  assert.ok(html.includes('class="picture-photo" src="about-photo.png"'));
  assert.ok(html.includes('loading="lazy" decoding="async" alt="Nicholas Yi."'));
  assert.ok(html.includes("<span>and room to grow.</span>"));
  const photo = await fetch(`${origin}/about-photo.png`);
  assert.equal(photo.status, 200);
  assert.match(photo.headers.get("content-type"), /image\/png/);
  const png = Buffer.from(await photo.arrayBuffer());
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 400);
  assert.equal(png.readUInt32BE(20), 400);
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /\.house-furniture \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)[^}]*column-gap: 0/);
  assert.equal(row.match(/class="picture-art"[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/)[1].split("\n").length, 14);
  assert.equal(row.match(/class="hearth-surround"[^>]*>([\s\S]*?)<\/pre>/)[1].split("\n").length, 14);
  assert.ok(row.includes('aria-label="An opening flower and a small unopened bud."'));
  assert.ok(row.includes("         |   .-.\n         |   \\_/"));
  assert.match(css, /\.picture-photo \{[^}]*height: 13\.5em;[^}]*object-fit: cover;[^}]*object-position: 75% center/);
  const graph = await (await fetch(`${origin}/graph.js`)).text();
  assert.ok(graph.includes('actions.append(undo, redo, clear)'));
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
  const garden = await (await fetch(`${origin}/garden.js`)).text();
  assert.ok(garden.includes('".work-section, .links-main, .about-main, .error-main"'));
  const umbrella = await (await fetch(`${origin}/umbrella.js`)).text();
  assert.ok(umbrella.includes('".play-section, .house-shelter, .site-header, .site-footer"'));
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
  assert.ok(html.includes('href="links.html">More work <span aria-hidden="true">&#8594;</span>'));
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
  const source = await script.text();
  assert.ok(source.includes('view.fetch("/api/listening"'));
  assert.ok(source.includes('event.key !== "Escape"'));
  assert.ok(source.includes('"focusin", open'));
  assert.ok(source.includes('if (card.hidden || doc.hidden) return;'));
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
  for (const [path, canonical] of [["/", ""], ["/about.html", "about"], ["/links.html", "links"]]) {
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
    assert.ok(html.includes('class="hearth" role="img"'));
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

test("active section tracking preserves static page markers and normal navigation", async () => {
  const garden = await (await fetch(`${origin}/garden.js`)).text();
  assert.ok(garden.includes('document.querySelectorAll("nav a[href^=\'#\']")'));
  assert.ok(garden.includes('link.setAttribute("aria-current", "location")'));
  assert.ok(garden.includes('link.removeAttribute("aria-current")'));
  assert.ok(garden.includes('window.addEventListener("scroll", scheduleNavigation, { passive: true })'));
  assert.ok(garden.includes('window.addEventListener("hashchange", scheduleNavigation)'));
  assert.ok(garden.includes("bounds.top <= marker && bounds.bottom > marker"));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.match(css, /nav a\[aria-current\] \{[^}]*text-decoration: underline/);
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
  assert.ok(html.includes('href="https://arxiv.org/html/2609.34242v2#S3"'));
  assert.ok(!html.includes("rotation"));
  assert.ok(html.includes("I co-authored Stashbird."));
  assert.ok(html.includes("owning evaluation across memory systems and benchmarks"));
  assert.ok(html.includes("This is a team project; the method below comes from our co-authored paper."));
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

test("reflective writing drops the template headings while retaining evidence and contribution boundaries", async () => {
  const html = await (await fetch(`${origin}/links.html`)).text();
  const stories = [...html.matchAll(/<details class="work-story" id="[^"]+">([\s\S]*?)<\/details>/g)].map(match => match[1]);
  const text = stories.join(" ");
  assert.ok(text.includes("remember what I said, but also notice when I no longer mean it"));
  assert.ok(text.includes("what was (or was not) measured"));
  assert.ok(text.includes("I co-authored Stashbird."));
  assert.ok(text.includes("owning evaluation across memory systems and benchmarks"));
  for (const heading of ["The problem", "The design tradeoff", "What the evidence establishes", "Separate the kinds of failure", "Make comparisons inspectable", "Test the promise you actually make"]) {
    assert.ok(!new RegExp(`<h[34]>${heading}</h[34]>`).test(text));
  }
  assert.ok(!text.includes("product rollout") && !text.includes("unpublished result"));
  assert.ok(!text.includes("Once We Were Us") && !text.includes("Chungking Express"));
});
