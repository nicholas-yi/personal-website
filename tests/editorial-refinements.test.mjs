import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("field notes is discoverable on every page without changing canonical paths or resume content", async () => {
  const files = ["index.html", "about.html", "links.html", "404.html", "notes/evaluation.html"];
  for (const file of files) {
    const html = await read(`public/${file}`);
    const nav = html.match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)[1];
    assert.deepEqual([...nav.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map(match => match[1]), ["work", "play", "about", "field notes"]);
    assert.match(nav, /href="\/?links\.html"/);
  }
  const links = await read("public/links.html");
  assert.ok(links.includes("<title>Field notes &amp; milestones - Nicholas Yi</title>"));
  assert.ok(links.includes('rel="canonical" href="https://nicholasyi.me/links"'));
  const home = await read("public/index.html");
  assert.ok(home.includes('href="links.html#field-notes-heading">Field notes'));
  assert.ok(home.includes('href="links.html#public-links-heading">More work'));
  for (const html of [home, links]) {
    assert.ok(html.includes('class="resume-placeholder" title="Resume link coming soon">resume (soon)'));
    const work = html.match(/data-work="mai">([\s\S]*?)<\/(?:article|li)>/)[1];
    assert.ok(work.includes('class="eyebrow">Microsoft AI Development and Acceleration'));
    assert.ok(work.includes('href="https://microsoft.ai/">Microsoft AI Development and Acceleration'));
  }
  const about = await read("public/about.html");
  assert.ok(about.includes("<li>therapeutic archery as an ex-olympic training team usa member,</li>"));
});

test("the compact mobile window and legible graph do not shrink the introduction or touch targets", async () => {
  const css = await read("public/styles.css");
  assert.ok(css.includes(".rain-window { width: min(100%, 220px); }"));
  assert.ok(css.includes(".rain-pane { height: 8.1em; }"));
  assert.ok(css.includes(".intro-copy, .links-intro, .about-copy p, .work-copy > p, .public-link-entry > p { font-size: 16px; }"));
  const graph = await read("public/graph.css");
  assert.match(graph, /\[data-graph-compact="true"\] \.kg-node \{[^}]*min-height: 44px;[^}]*font-size: 0\.75rem/);
  assert.ok(!graph.includes("0.56rem"));
  const home = await read("public/index.html");
  assert.ok(home.includes("Building things that learn,<br class=\"desktop-break\"> remember, and work."));
  assert.ok(home.includes("<p>I'm interested in how agents remember, how we know they're getting better, and what it takes to make research useful in the real world.</p>"));
});

test("the README accurately identifies deployed analytics and the sound opt-in default", async () => {
  const readme = await read("README.md");
  assert.ok(readme.includes("the live site uses cloudflare web analytics"));
  assert.ok(readme.includes("**sound** — off by default"));
  assert.ok(!readme.includes("no tracking") && !readme.includes("on by default"));
});

test("revised writing preserves attribution, semantic-decision limits and synchronized evaluation openings", async () => {
  const links = await read("public/links.html");
  const note = await read("public/notes/evaluation.html");
  const memory = links.match(/aria-label="Stashbird case study">([\s\S]*?)<\/article>/)[1];
  const excerpt = links.match(/aria-label="Evaluation field note">([\s\S]*?)<\/article>/)[1];
  const paragraphs = html => [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(match => match[1]);
  assert.deepEqual(paragraphs(excerpt).slice(0, 2), paragraphs(note).slice(0, 2));
  assert.ok(memory.includes("I co-authored Stashbird."));
  assert.ok(memory.includes("owning evaluation across memory systems and benchmarks"));
  assert.ok(memory.includes("semantic decisions are held fixed</strong>"));
  assert.ok(memory.includes("not, on its own, evidence that every model-generated interpretation"));
  assert.ok(memory.includes("This is a team project"));
  assert.ok(note.includes("an unfinished run") || note.includes("An unfinished run"));
  assert.ok(note.includes("it should not quietly replace the attempt that came before it"));
  assert.ok(note.includes('href="https://arxiv.org/html/2609.34242v2#S3"'));
  for (const html of [memory, note]) {
    assert.ok(!html.includes("76.4") && !html.includes("unpublished result") && !html.includes("Andrew Sun"));
    assert.equal((html.match(/class="story-aside"/g) ?? []).length, 1);
  }
});

test("original writing is retained in an isolated review snapshot rather than shipped inside the normal page", async () => {
  const snapshot = JSON.parse(await read("public/writing-originals.json"));
  assert.equal(snapshot.revision, "c854becedd453e0b57e07c978a57ced2d398f0b7");
  assert.ok(snapshot.memory.startsWith("<p>I keep coming back to memory"));
  assert.ok(snapshot.memory.includes("The part I worked on"));
  assert.ok(snapshot.evaluation.startsWith("<p>It is easy to want a number"));
  const links = await read("public/links.html");
  assert.ok(!links.includes("It is easy to want a number"));
  assert.ok(!links.includes('id="writing-review"'));
  const loader = await read("public/writing-review.js");
  assert.ok(loader.startsWith('if (new URL(location.href).searchParams.get("review") === "writing")'));
  assert.ok(loader.includes('fetch(new URL("./writing-originals.json", import.meta.url))'));
  assert.ok(loader.includes('["Original", oldHTML], ["Revised", revised.innerHTML]'));
  assert.ok(loader.includes('robots.content = "noindex"'));
  assert.ok(loader.includes('notice.setAttribute("role", "alert")'));
});
