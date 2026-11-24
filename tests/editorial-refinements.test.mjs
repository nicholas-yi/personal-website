import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("field notes is discoverable on every page with stable canonical paths", async () => {
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
});

test("the compact mobile window and legible graph do not shrink the introduction or touch targets", async () => {
  const css = await read("public/styles.css");
  assert.ok(css.includes(".rain-window { width: min(100%, 220px); }"));
  assert.ok(css.includes(".rain-pane { height: 8.1em; }"));
  assert.ok(css.includes(".intro-copy, .links-intro, .about-copy p, .work-copy > p, .public-link-entry > p { font-size: 16px; }"));
  const graph = await read("public/graph.css");
  assert.match(graph, /\[data-graph-compact="true"\] \.kg-node \{[^}]*min-height: 44px;[^}]*font-size: 0\.75rem/);
});

test("the README accurately identifies deployed analytics and the sound opt-in default", async () => {
  const readme = await read("README.md");
  assert.ok(readme.includes("the live site uses cloudflare web analytics"));
  assert.ok(readme.includes("**sound** — off by default"));
  assert.ok(!readme.includes("no tracking") && !readme.includes("on by default"));
});

test("writing preserves attribution, semantic-decision limits and synchronized evaluation openings", async () => {
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
    assert.equal((html.match(/class="story-aside"/g) ?? []).length, 1);
  }
});
