import test from "node:test";
import assert from "node:assert/strict";
import { INTERACTION_SOUNDS, classifyActivation, installInteractionSounds } from "../public/interaction-sounds.js";

const origin = "http://127.0.0.1:4173/";

class Target {
  nodeType = 1;
  constructor(properties = {}, parent = null) {
    Object.assign(this, { id: "", tag: "div" }, properties);
    this.parentElement = parent;
  }
  getAttribute(name) { return name === "href" ? this.href ?? null : null; }
  closest(selector) {
    const matches = selector === "a[href]" ? this.href !== undefined
      : selector === "button" ? this.tag === "button"
        : selector === "[data-graph-playground]" ? this.graph
          : selector === "input, textarea, select, [contenteditable]" ? this.editable : false;
    return matches ? this : this.parentElement?.closest(selector) ?? null;
  }
}

function documentFixture() {
  const listeners = new Map();
  return {
    baseURI: origin,
    collapsed: true,
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    getSelection() { return { isCollapsed: this.collapsed }; },
    emit(type, properties = {}) {
      const event = { target: new Target(), button: 0, detail: 1, pointerId: 1, clientX: 0, clientY: 0, defaultPrevented: false, ...properties };
      for (const listener of listeners.get(type) ?? []) listener(event);
      return event;
    },
  };
}

test("each interaction class has a distinct, quiet, immutable sound recipe", () => {
  const recipes = Object.values(INTERACTION_SOUNDS);
  assert.equal(recipes.length, 15);
  assert.equal(new Set(recipes.map((recipe) => JSON.stringify(recipe))).size, 15);
  for (const recipe of recipes) {
    assert.ok(Object.isFrozen(recipe));
    for (const note of recipe) {
      assert.ok(Object.isFrozen(note));
      assert.ok(note.volume > 0 && note.volume <= 0.025);
      assert.ok(note.duration >= 0.04 && note.duration <= 0.16);
      assert.ok(note.at >= 0 && note.at <= 0.06);
    }
  }
});

test("opening and closing umbrellas have cloth-like noise with distinct rising and falling tones", () => {
  const open = INTERACTION_SOUNDS["umbrella-open"][0];
  const close = INTERACTION_SOUNDS["umbrella-close"][0];
  assert.ok(open.endPitch > open.pitch);
  assert.ok(close.endPitch < close.pitch);
  assert.ok(open.noiseVolume > 1 && close.noiseVolume > 1);
  assert.ok(open.noiseAttack > 0 && close.noiseAttack > 0);
});

test("links, contacts, weather controls, buttons, and background have separate classes", () => {
  assert.equal(classifyActivation({ href: "#notes" }, origin), "navigation");
  assert.equal(classifyActivation({ href: "/index.html" }, origin), "navigation");
  assert.equal(classifyActivation({ href: "https://arxiv.org/abs/2609.34242", inGraph: true }, origin), "link");
  assert.equal(classifyActivation({ href: "mailto:nicholasyiofficial@gmail.com" }, origin), "contact");
  assert.equal(classifyActivation({ href: "tel:123" }, origin), "contact");
  assert.equal(classifyActivation({ control: "motion-toggle" }, origin), "weather");
  assert.equal(classifyActivation({ control: "sound-toggle" }, origin), null);
  assert.equal(classifyActivation({ control: "other-button" }, origin), "button");
  assert.equal(classifyActivation({ inGraph: true, control: "graph-dot" }, origin), null);
  assert.equal(classifyActivation({ editable: true, background: true }, origin), null);
  assert.equal(classifyActivation({ background: true }, origin), "rain");
  assert.equal(classifyActivation({}, origin), null);
  assert.equal(classifyActivation({ href: "javascript:void(0)" }, origin), null);
  assert.throws(() => classifyActivation({ href: "http://[" }, origin), TypeError);
});

test("link press sounds once without blocking navigation; keyboard activation also sounds once", () => {
  const doc = documentFixture();
  const played = [];
  installInteractionSounds(doc, (kind) => { played.push(kind); return true; });
  const anchor = new Target({ href: "#notes" });
  const child = new Target({}, anchor);
  const down = doc.emit("pointerdown", { target: child });
  const click = doc.emit("click", { target: child });
  assert.deepEqual(played, ["navigation"]);
  assert.equal(down.defaultPrevented, false);
  assert.equal(click.defaultPrevented, false);
  doc.emit("click", { target: child, detail: 0 });
  assert.deepEqual(played, ["navigation", "navigation"]);
});

test("graph actions sound semantically, not twice via their bubbling clicks", () => {
  const doc = documentFixture();
  const played = [];
  installInteractionSounds(doc, (kind) => { played.push(kind); return true; });
  const root = new Target({ graph: true });
  const dot = new Target({ tag: "button" }, root);
  for (const kind of ["node", "connection", "clear"]) doc.emit("site:interaction", { target: root, detail: { kind } });
  doc.emit("click", { target: dot });
  assert.deepEqual(played, ["node", "connection", "clear"]);
  const source = new Target({ href: "https://arxiv.org/abs/2609.34242" }, root);
  doc.emit("pointerdown", { target: source });
  doc.emit("click", { target: source });
  assert.equal(played.at(-1), "link");
  assert.equal(played.length, 4);
});

test("drawing, text selection, cancelled gestures, and prevented clicks don't make click spam", () => {
  const doc = documentFixture();
  const played = [];
  installInteractionSounds(doc, (kind) => { played.push(kind); return true; });
  doc.emit("pointerdown");
  doc.emit("pointermove", { clientX: 100 });
  doc.emit("pointerup", { clientX: 100 });
  doc.emit("click");
  doc.emit("click", { detail: 0 });
  doc.emit("pointercancel");
  doc.emit("click");
  doc.emit("pointerdown");
  doc.collapsed = false;
  doc.emit("click");
  doc.emit("click", { target: new Target({ tag: "button" }), defaultPrevented: true });
  doc.emit("click", { target: new Target({ tag: "button" }), button: 2 });
  assert.deepEqual(played, []);
});

test("weather click works and removing the binding removes its listeners", () => {
  const doc = documentFixture();
  const played = [];
  const remove = installInteractionSounds(doc, (kind) => { played.push(kind); return true; });
  const weather = new Target({ tag: "button", id: "motion-toggle" });
  doc.emit("click", { target: weather, detail: 0 });
  assert.deepEqual(played, ["weather"]);
  remove();
  doc.emit("click", { target: weather });
  doc.emit("site:interaction", { target: new Target({ graph: true }), detail: { kind: "node" } });
  assert.deepEqual(played, ["weather"]);
});
