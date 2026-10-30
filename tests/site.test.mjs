import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createSiteServer } from "../server.mjs";

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
  for (const id of ["work", "notes", "play", "about", "main"]) assert.ok(html.includes(`id="${id}"`));
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

test("the small type experiment is a real link with one accessible name", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes('class="type-proof" href="#notes" aria-label="notes"'));
  assert.ok(html.includes('class="type-face face-serif" aria-hidden="true"'));
  assert.ok(html.includes('class="type-face face-sans" aria-hidden="true"'));
  assert.ok(!html.includes("fireflies"));
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.ok(css.includes('grid-template-areas: "word"'));
  assert.ok(css.includes(":focus-visible"));
  assert.ok(css.includes("prefers-reduced-motion"));
});

test("the graph keeps its fallback and concise invitation, with detailed accessible instructions", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes("data-graph-playground"));
  assert.ok(html.includes('class="graph-fallback"'));
  assert.ok(html.includes("Enable JavaScript to connect the dots."));
  assert.ok(html.includes('<p class="play-intro">See what connects.</p>'));
  assert.ok(!html.includes("Hold down and draw through"));
  const graph = await (await fetch(`${origin}/graph.js`)).text();
  assert.ok(graph.includes('"Draw a line, or tap two dots."'));
  assert.ok(!graph.includes("Scroll outside the paper. Esc cancels."));
  assert.ok(!graph.includes('"kg-help"'));
  assert.ok(graph.includes('"Draw through up to three dots, or click or tap two. Keyboard:'));
  assert.ok(graph.includes('plot.setAttribute("aria-describedby", keyboardHelp.id)'));
  assert.ok(graph.includes("On touch screens, swipe outside the paper to scroll."));
  assert.ok(!graph.includes('"kg-instruction"'));
  assert.ok(!graph.includes("Ten dots from my work and life."));
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
    "https://www.kaggle.com/nicholasyi/competitions",
    "https://github.com/microsoft/Staccato-Stuttered-ASR",
  ]) assert.ok(html.includes(`href="${url}"`), url);
  assert.ok(html.includes("17th place") && html.includes("18th place"));
  assert.ok(html.includes('aria-label="Stashbird preprint PDF"'));
  assert.ok(html.includes('aria-label="Kuzushiji Recognition final leaderboard"'));
  assert.ok(html.includes('aria-label="Hateful Memes Phase 2 result, nickyi in eighteenth place"'));
  assert.ok(!html.includes("https://patents.google.com/"));
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
  for (const [id, date] of [["mai", "2026-07"], ["stashbird", "2026-09"], ["graphrag", "2026-04"], ["staccato", "2025-11"]]) {
    assert.ok(cards.find((card) => card[1] === id)[2].includes(`datetime="${date}"`));
  }
  assert.ok(cards[1][2].includes("preprint"));
  assert.ok(cards[2][2].includes("article"));
  assert.ok(cards[2][2].includes("continued alongside the Stashbird rotation"));
  const graph = await (await fetch(`${origin}/graph.js`)).text();
  assert.ok(!graph.includes("A little local-only doodle. Nothing is saved or sent."));
  assert.ok(graph.includes('"kg-paper-cue", "hold + drag"'));
  assert.ok(graph.includes('report("ready", "Pick a dot.")'));
});

test("the links page puts current work first, then milestones in descending date order", async () => {
  const html = await (await fetch(`${origin}/links.html`)).text();
  assert.ok(html.includes('href="index.html#play"'));
  assert.ok(html.includes('href="links.html" aria-current="page"'));
  const entries = [...html.matchAll(/<li class="public-link-entry"[^>]*>([\s\S]*?)<\/li>/g)];
  assert.equal(entries.length, 7);
  const datedEntries = entries.filter((entry) => entry[1].includes("<time"));
  assert.deepEqual(datedEntries.map((entry) => entry[1].match(/datetime="([^"]+)"/)[1]),
    ["2026-07", "2026-09", "2026-04", "2025-11", "2020", "2019"]);
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
  assert.ok(graph.includes("faint lines: existing ties"));
  const css = await (await fetch(`${origin}/graph.css`)).text();
  assert.ok(css.includes(".kg-reference-edge"));
});

test("the sidequest staircases preserve the user's exact wording and reading order", async () => {
  const html = await (await fetch(origin)).text();
  const about = html.slice(html.indexOf('class="about-copy"'), html.indexOf('class="house-furniture"'));
  const paths = [...about.matchAll(/<ul class="sidequest-path" role="list">([\s\S]*?)<\/ul>/g)];
  assert.deepEqual(paths.map((path) => [...path[1].matchAll(/<li>([^<]+)<\/li>/g)].map((item) => item[1])), [
    ["a trail less taken,", "an art museum undiscovered,", "a recipe untried."],
    [
      "my archival art volunteering at the stanford rodin centre,",
      "or therapeutic shoooting at the archery range as an ex-olympic training Team USA member,",
      "or film development as an aspiring hobbyist photographer,",
      "or open-sourcing my work and entering online competitions,",
    ],
  ]);
  assert.ok(about.includes('<p class="sidequest-lead">I write sidequests into my main life journey:</p>'));
  assert.ok(about.includes('<p class="sidequest-lead">so whether it be</p>'));
  const conclusion = about.match(/<p class="sidequest-conclusion">([\s\S]*?)<\/p>/)[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  assert.equal(conclusion, "I seek to understand the outside world one different lens, or neural layer, at a time");
  assert.ok(about.includes("If any of those are your thing"));
  assert.ok(!about.includes("Carnegie Mellon") && !about.includes("Amazon") && !about.includes("Cisco"));
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
  assert.ok(css.includes(".sidequest-conclusion > span { display: block; }"));
});

test("the requested headline and interests stay verbatim, while employer naming and copy are updated", async () => {
  const html = await (await fetch(origin)).text();
  const headline = html.match(/<p class="intro-line">([\s\S]*?)<\/p>/)[1].replace(/<br[^>]*> /, "\n");
  assert.equal(headline, "Building things that learn,\nremember, and work.");
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

test("both pages have global navigation and a still-usable ASCII fireplace", async () => {
  for (const path of ["/", "/links.html"]) {
    const html = await (await fetch(`${origin}${path}`)).text();
    assert.ok(html.includes('class="site-header"'));
    assert.ok(html.includes('class="hearth" role="img"'));
    assert.ok(html.includes('class="hearth-frame hearth-frame-one"'));
    assert.ok(html.includes("a warm place to end up."));
  }
  const css = await (await fetch(`${origin}/styles.css`)).text();
  assert.ok(css.includes(".site-header { position: sticky; top: 0;"));
  assert.ok(css.includes('[data-rain] .hearth-frame { animation: none; }'));
});

test("the about house has picture-frame, fireplace, and flower furniture in the new requested order", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes('class="house-roof"'));
  assert.ok(html.includes('class="house-body"'));
  assert.ok(html.includes('class="house-furniture"'));
  const row = html.slice(html.indexOf('class="house-furniture"'));
  assert.ok(row.indexOf('class="picture-frame"') < row.indexOf('class="hearth"'));
  assert.ok(row.indexOf('class="hearth"') < row.indexOf('class="about-garden"'));
  assert.ok(html.includes("An empty rectangular picture frame"));
  const graph = await (await fetch(`${origin}/graph.js`)).text();
  assert.ok(graph.includes('actions.append(undo, redo, clear)'));
});

test("Rodin is mentioned without linking or publishing the supplied essay", async () => {
  const html = await (await fetch(origin)).text();
  assert.ok(html.includes("my archival art volunteering at the stanford rodin centre,"));
  assert.ok(!/<a\b[^>]*>[^<]*(?:Rodin|Stanford)/i.test(html));
  assert.ok(!html.includes("Rodin_ The Nonconformist") && !html.includes("docs/Misc") && !html.includes("docs\\Misc"));
  const response = await fetch(`${origin}/Rodin_%20The%20Nonconformist%20and%20His%20Lasting%20Legacies.pdf`);
  assert.equal(response.status, 404);
  const graph = await (await fetch(`${origin}/graph-model.js`)).text();
  assert.ok(graph.includes("Rodin at Stanford"));
  assert.ok(!graph.includes("MAIDAP") && !graph.includes('"Stash"'));
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
