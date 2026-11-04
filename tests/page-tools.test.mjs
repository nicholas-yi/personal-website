import test from "node:test";
import assert from "node:assert/strict";
import { createRainPreference, RAIN_PREFERENCE_KEY, revealStory, noteShareURL, copyText } from "../public/page-tools.js";

function storage(initial = null) {
  const values = new Map(initial === null ? [] : [[RAIN_PREFERENCE_KEY, initial]]);
  return {
    values,
    view: { sessionStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } },
  };
}

test("rain defaults to the OS preference, then remembers explicit pause/on choices across page instances", () => {
  const { values, view } = storage();
  const preference = createRainPreference(view, assert.fail);
  assert.equal(preference.enabled(false), true);
  assert.equal(preference.enabled(true), false);
  preference.remember(false);
  assert.equal(values.get(RAIN_PREFERENCE_KEY), "paused");
  assert.equal(createRainPreference(view, assert.fail).enabled(false), false);
  preference.remember(true);
  assert.equal(values.get(RAIN_PREFERENCE_KEY), "moving");
  assert.equal(createRainPreference(view, assert.fail).enabled(false), true);
  assert.deepEqual([...values.keys()], [RAIN_PREFERENCE_KEY]);
  assert.throws(() => preference.remember("true"), TypeError);
});

test("automatic reduced motion never enables animation or overwrites the explicit visit choice", () => {
  for (const saved of ["moving", "paused"]) {
    const { values, view } = storage(saved);
    const preference = createRainPreference(view, assert.fail);
    assert.equal(preference.enabled(true), false);
    assert.equal(values.get(RAIN_PREFERENCE_KEY), saved);
    assert.equal(preference.enabled(false), saved === "moving");
  }
});

test("BFCache restoration re-reads changes while a separate visit has no stored preference", () => {
  const { values, view } = storage("moving");
  const preference = createRainPreference(view, assert.fail);
  values.set(RAIN_PREFERENCE_KEY, "paused");
  preference.restore();
  assert.equal(preference.enabled(false), false);
  const separate = createRainPreference(storage().view, assert.fail);
  assert.equal(separate.enabled(false), true);
});

test("blocked and invalid storage are explicit, while current-page controls still work", () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    const reports = [];
    const view = { get sessionStorage() { throw new Error("Storage denied"); } };
    const preference = createRainPreference(view, message => reports.push(message));
    assert.equal(reports.length, 1);
    preference.remember(false);
    assert.equal(preference.enabled(false), false);
    assert.equal(reports.length, 2);
    assert.match(reports[1], /couldn't remember/);
    const invalid = createRainPreference(storage("unexpected").view, message => reports.push(message));
    assert.equal(invalid.enabled(true), false);
    assert.equal(reports.length, 3);
    assert.equal(warnings.length, 3);
  } finally { console.warn = warn; }
});

function notes() {
  const outer = { open: false, parentElement: null };
  const story = {
    id: "memory-note", open: false,
    closest: () => story,
    parentElement: { closest: () => outer },
    matches: selector => selector === "details.work-story",
  };
  const heading = { closest: () => story };
  const main = { closest: () => null, matches: () => false };
  const doc = {
    getElementById: id => ({ "memory-note": story, "inside-note": heading, main })[id] ?? null,
    querySelector: () => ({ href: "https://nicholasyi.me/links?preview=unused" }),
  };
  return { doc, story, outer, heading };
}

test("direct, encoded, nested and already-open note targets reveal the correct disclosure", () => {
  const { doc, story, outer, heading } = notes();
  assert.equal(revealStory(doc, "#memory%2Dnote"), story);
  assert.equal(story.open, true);
  assert.equal(outer.open, true);
  story.open = false;
  assert.equal(revealStory(doc, "#inside-note"), heading);
  assert.equal(story.open, true);
  assert.equal(revealStory(doc, "#memory-note"), story);
  assert.equal(revealStory(doc, "#main"), null);
  assert.equal(revealStory(doc, "#unknown"), null);
  assert.equal(revealStory(doc, ""), null);
  assert.throws(() => revealStory(doc, "#%"), URIError);
});

test("shared note URLs use the public canonical path and never carry preview/query parameters", () => {
  const { doc } = notes();
  assert.equal(noteShareURL(doc, "memory-note"), "https://nicholasyi.me/links#memory-note");
  assert.throws(() => noteShareURL(doc, "unknown"), /not available/);
  doc.querySelector = () => null;
  assert.throws(() => noteShareURL(doc, "memory-note"), /canonical URL is missing/);
  doc.querySelector = () => ({ href: "mailto:example@example.com" });
  assert.throws(() => noteShareURL(doc, "memory-note"), /web URL/);
});

test("clipboard writes happen only on request, and denial or missing support is not reported as success", async () => {
  const writes = [];
  const view = { navigator: { clipboard: { async writeText(text) { writes.push(text); } } } };
  assert.equal(writes.length, 0);
  await copyText(view, "hello@example.com");
  assert.deepEqual(writes, ["hello@example.com"]);
  const denied = new Error("Permission denied");
  view.navigator.clipboard.writeText = async () => { throw denied; };
  await assert.rejects(copyText(view, "test"), error => error === denied);
  await assert.rejects(copyText({ navigator: {} }, "test"), /unavailable/);
  await assert.rejects(copyText(view, " "), TypeError);
});
