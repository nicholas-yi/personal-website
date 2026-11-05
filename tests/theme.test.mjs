import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../public/theme.js", import.meta.url), "utf8");
const key = "nicholas-yi:theme";

function fixture(saved = null, denied = false, values = new Map(saved === null ? [] : [[key, saved]])) {
  const doc = new EventTarget();
  doc.readyState = "loading";
  doc.documentElement = { dataset: {} };
  const button = new EventTarget();
  const attributes = new Map();
  button.hidden = true;
  button.setAttribute = (name, value) => attributes.set(name, value);
  button.getAttribute = name => attributes.get(name);
  const status = { textContent: "" };
  const meta = { content: "#f8f7f2" };
  doc.querySelector = selector => {
    if (selector === 'meta[name="theme-color"]') return meta;
    if (doc.readyState === "loading") return null;
    return selector === "#theme-toggle" ? button : selector === "#garden-status" ? status : null;
  };
  const view = new EventTarget();
  Object.defineProperty(view, "sessionStorage", {
    get() {
      if (denied) throw new Error("Storage denied");
      return { getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value) };
    },
  });
  Object.defineProperty(view, "localStorage", {
    get() { throw new Error("Old cross-visit palette storage must not be accessed."); },
  });
  const warnings = [];
  let changes = 0;
  view.addEventListener("themechange", () => changes++);
  runInNewContext(source, { window: view, document: doc, Event, console: { warn: (...args) => warnings.push(args) } });
  return {
    doc, view, button, attributes, values, status, meta, warnings,
    changes: () => changes,
    ready() { doc.readyState = "interactive"; doc.dispatchEvent(new Event("DOMContentLoaded")); },
  };
}

test("the current visit's lamplight is applied in the head before controls or page content are ready", () => {
  const f = fixture("lamplight");
  assert.equal(f.doc.documentElement.dataset.theme, "lamplight");
  assert.equal(f.meta.content, "#24231f");
  assert.equal(f.button.hidden, true);
  f.ready();
  assert.equal(f.button.hidden, false);
  assert.equal(f.attributes.get("aria-pressed"), "true");
  assert.equal(f.attributes.get("aria-label"), "Switch to daylight");
  assert.equal(f.doc.documentElement.dataset.themeReady, "true");
});

test("a fresh visit defaults to daylight; explicit toggles persist only the theme and emit one palette event", () => {
  const f = fixture();
  assert.equal(f.doc.documentElement.dataset.theme, "daylight");
  assert.equal(f.values.size, 0);
  f.ready();
  const before = f.changes();
  f.button.dispatchEvent(new Event("click"));
  assert.equal(f.doc.documentElement.dataset.theme, "lamplight");
  assert.equal(f.values.get(key), "lamplight");
  assert.equal(f.changes(), before + 1);
  assert.equal(f.button.title, "Switch to daylight");
  f.button.dispatchEvent(new Event("click"));
  assert.equal(f.doc.documentElement.dataset.theme, "daylight");
  assert.equal(f.values.get(key), "daylight");
  assert.equal(f.meta.content, "#f8f7f2");
  assert.deepEqual([...f.values.keys()], [key]);
});

test("denied or invalid storage is announced and does not prevent switching palettes", () => {
  for (const f of [fixture(null, true), fixture("unexpected")]) {
    assert.equal(f.warnings.length, 1);
    f.ready();
    assert.ok(f.status.textContent.includes("couldn't save or restore"));
    f.button.dispatchEvent(new Event("click"));
    assert.equal(f.doc.documentElement.dataset.theme, "lamplight");
  }
});

test("lamp choice persists across pages and reloads in one visit but never enables a new visit's lamp", () => {
  const first = fixture();
  first.ready();
  first.button.dispatchEvent(new Event("click"));
  const nextPage = fixture(null, false, first.values);
  nextPage.ready();
  assert.equal(nextPage.doc.documentElement.dataset.theme, "lamplight");
  assert.equal(nextPage.attributes.get("aria-pressed"), "true");
  assert.equal(fixture(null, false, first.values).doc.documentElement.dataset.theme, "lamplight");
  const newVisit = fixture();
  newVisit.ready();
  assert.equal(newVisit.doc.documentElement.dataset.theme, "daylight");
  assert.equal(newVisit.attributes.get("aria-pressed"), "false");
  assert.equal(newVisit.meta.content, "#f8f7f2");
  assert.equal(newVisit.warnings.length, 0);
});

test("a previous visit's local-storage change does not switch the current visit's palette", () => {
  const f = fixture();
  f.ready();
  f.view.dispatchEvent(Object.assign(new Event("storage"), { key, newValue: "lamplight" }));
  assert.equal(f.doc.documentElement.dataset.theme, "daylight");
  assert.equal(f.attributes.get("aria-pressed"), "false");
  assert.equal(f.warnings.length, 0);
});

test("BFCache restoration re-reads the manual setting without generating redundant recolor events", () => {
  const f = fixture("daylight");
  f.ready();
  f.values.set(key, "lamplight");
  f.view.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  assert.equal(f.doc.documentElement.dataset.theme, "lamplight");
  const changes = f.changes();
  f.view.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  assert.equal(f.changes(), changes);
});
