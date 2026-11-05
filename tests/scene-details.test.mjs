import test from "node:test";
import assert from "node:assert/strict";
import { installSceneDetails } from "../public/scene-details.js";

const projects = new Set(["bird", "agent", "graph", "speech"]);

function fixture(kinds = ["chair", "flower", "steam", "plant", "bird", "agent", "graph", "speech", "embers"]) {
  const doc = new EventTarget();
  doc.hidden = false;
  doc.documentElement = { dataset: { rain: "moving" } };
  const reduced = new EventTarget();
  reduced.matches = false;
  const forced = new EventTarget();
  forced.matches = false;
  const buttons = kinds.map(kind => {
    const button = new EventTarget();
    button.dataset = { sceneDetail: kind };
    button.disabled = true;
    button.attributes = {};
    button.setAttribute = (name, value) => { button.attributes[name] = value; };
    button.properties = {};
    button.style = { setProperty(name, value) { button.properties[name] = value; } };
    button.card = new EventTarget();
    button.contains = target => target === button;
    button.card.contains = target => target === button || target === button.card || target?.card === button.card;
    button.closest = () => button.card;
    return button;
  });
  doc.querySelectorAll = () => buttons;
  const timers = new Map();
  const callbacks = {};
  const view = new EventTarget();
  let sequence = 0;
  let now = 0;
  Object.assign(view, {
    matchMedia: query => query.includes("reduced") ? reduced : forced,
    setTimeout(callback, delay) {
      assert.ok(Number.isFinite(delay) && delay > 0);
      const id = ++sequence;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame() { assert.fail("Scene interactions must not create JavaScript animation loops."); },
    IntersectionObserver: class {
      constructor(callback) { callbacks.visible = callback; }
      observe(target) { assert.ok(buttons.includes(target)); }
    },
    MutationObserver: class {
      constructor() { assert.fail("Manual scene interactions must be independent of weather changes."); }
    },
  });
  doc.defaultView = view;
  installSceneDetails(doc);
  const button = kind => buttons.find(candidate => candidate.dataset.sceneDetail === kind);
  const event = (target, type, values = {}) => {
    const message = new Event(type, { cancelable: true });
    Object.assign(message, values);
    target.dispatchEvent(message);
    return message;
  };
  return {
    doc, view, buttons, reduced, forced, callbacks, timers, button, event,
    visible(value = true) { callbacks.visible(buttons.map(target => ({ target, isIntersecting: value }))); },
    hover(kind) {
      const target = button(kind);
      event(projects.has(kind) ? target.card : target, "pointerenter", { pointerType: "mouse" });
    },
    leave(kind) {
      const target = button(kind);
      event(projects.has(kind) ? target.card : target, "pointerleave", { pointerType: "mouse" });
    },
    advance(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        const [id, timer] = next;
        timers.delete(id);
        now = timer.at;
        timer.callback();
      }
      now = end;
    },
  };
}

test("scene details initialize as static art with no timer, and pages without details are unchanged", () => {
  const f = fixture();
  assert.equal(f.timers.size, 0);
  for (const button of f.buttons) {
    assert.equal(button.disabled, false);
    assert.notEqual(button.dataset.detailState, "playing");
  }
  assert.equal(f.button("chair").properties["--detail-duration"], "2100ms");
  assert.equal(f.button("flower").attributes["aria-pressed"], "false");
  assert.equal(installSceneDetails({ querySelectorAll: () => [] }), undefined);
  assert.throws(() => fixture(["unknown"]), /Unknown scene interaction/);
});

test("all one-shot effects play once and settle on their exact bounded durations", () => {
  for (const [kind, duration] of [["chair", 2100], ["steam", 1600], ["plant", 1500], ["bird", 1400], ["agent", 2400], ["graph", 3600], ["speech", 1900], ["embers", 1100]]) {
    const f = fixture();
    f.visible();
    f.hover(kind);
    assert.equal(f.button(kind).dataset.detailState, "playing");
    assert.equal(f.timers.size, 1);
    f.advance(duration - 1);
    assert.equal(f.button(kind).dataset.detailState, "playing");
    f.advance(1);
    assert.equal(f.button(kind).dataset.detailState, "rest");
    assert.equal(f.timers.size, 0);
    f.advance(10000);
    assert.equal(f.timers.size, 0);
    f.leave(kind);
    f.hover(kind);
    assert.equal(f.button(kind).dataset.detailState, "playing");
  }
});

test("rapid input is bounded and leaving a chair mid-rock lets its finite settling sequence finish", () => {
  const f = fixture();
  f.visible();
  f.hover("chair");
  for (let index = 0; index < 100; index++) f.event(f.button("chair"), "click");
  f.leave("chair");
  assert.equal(f.button("chair").dataset.detailState, "playing");
  assert.equal(f.timers.size, 1);
  f.advance(2100);
  assert.equal(f.button("chair").dataset.detailState, "rest");
  assert.equal(f.timers.size, 0);
});

test("the three-branch plant opens for hover/focus and supports explicit touch or keyboard toggling", () => {
  const f = fixture();
  f.visible();
  const flower = f.button("flower");
  f.hover("flower");
  assert.equal(flower.dataset.detailState, "bloom");
  assert.equal(flower.attributes["aria-pressed"], "true");
  f.leave("flower");
  assert.equal(flower.dataset.detailState, "rest");
  f.event(flower, "focusin");
  assert.equal(flower.dataset.detailState, "bloom");
  f.event(flower, "click");
  f.event(flower, "click");
  assert.equal(flower.dataset.detailState, "rest");
  f.event(flower, "click");
  assert.equal(flower.dataset.detailState, "bloom");
  f.event(flower, "focusout", { relatedTarget: null });
  assert.equal(flower.dataset.detailState, "rest");
  assert.equal(flower.dataset.butterfly, "departing");
  f.advance(850);
  assert.equal(f.timers.size, 0);
});

test("a butterfly arrives once, perches without timers, then leaves on mouse exit", () => {
  const f = fixture();
  f.visible();
  const flower = f.button("flower");
  f.hover("flower");
  assert.equal(flower.dataset.butterfly, "arriving");
  assert.equal(f.timers.size, 1);
  f.advance(600);
  f.visible();
  f.advance(599);
  assert.equal(flower.dataset.butterfly, "arriving");
  f.advance(1);
  assert.equal(flower.dataset.butterfly, "perched");
  assert.equal(f.timers.size, 0);
  f.advance(10000);
  assert.equal(flower.dataset.butterfly, "perched");
  f.leave("flower");
  assert.equal(flower.dataset.butterfly, "departing");
  assert.equal(flower.dataset.detailState, "rest");
  assert.equal(flower.attributes["aria-pressed"], "false");
  f.advance(849);
  assert.equal(flower.dataset.butterfly, "departing");
  f.advance(1);
  assert.equal(flower.dataset.butterfly, "idle");
  assert.equal(f.timers.size, 0);
});

test("rapid butterfly reversals have one timer and no stale arrival after departure", () => {
  const f = fixture();
  f.visible();
  const flower = f.button("flower");
  for (let index = 0; index < 100; index++) {
    f.hover("flower");
    f.advance(10);
    f.leave("flower");
    assert.equal(f.timers.size, 1);
  }
  f.hover("flower");
  f.advance(1200);
  assert.equal(flower.dataset.butterfly, "perched");
  assert.equal(f.timers.size, 0);
  f.leave("flower");
  f.advance(850);
  f.advance(5000);
  assert.equal(flower.dataset.butterfly, "idle");
  assert.equal(f.timers.size, 0);
});

test("reduced/hidden/offscreen and blur stop flights while retaining static accessible feedback", () => {
  for (const stop of [
    f => { f.reduced.matches = true; f.reduced.dispatchEvent(new Event("change")); },
    f => { f.forced.matches = true; f.forced.dispatchEvent(new Event("change")); },
    f => { f.doc.hidden = true; f.doc.dispatchEvent(new Event("visibilitychange")); },
    f => f.visible(false),
    f => f.view.dispatchEvent(new Event("blur")),
    f => f.event(f.button("flower"), "pointercancel"),
  ]) {
    const f = fixture();
    f.visible();
    f.hover("flower");
    stop(f);
    const phase = f.button("flower").dataset.butterfly;
    assert.ok(["perched", "idle"].includes(phase));
    assert.equal(f.timers.size, 0);
    f.advance(5000);
    assert.equal(f.button("flower").dataset.butterfly, phase);
  }
});

test("native clicks and focus trigger details, but touch scrolling and project navigation remain untouched", () => {
  const f = fixture();
  f.visible();
  const steam = f.button("steam");
  f.event(steam, "pointerenter", { pointerType: "touch" });
  assert.equal(steam.dataset.detailState, "rest");
  assert.equal(f.event(steam, "click").defaultPrevented, false);
  assert.equal(steam.dataset.detailState, "playing");
  const bird = f.button("bird");
  f.event(bird.card, "focusin");
  assert.equal(bird.dataset.detailState, "playing");
  const link = { card: bird.card };
  f.event(bird.card, "focusout", { relatedTarget: link });
  f.advance(1400);
  f.event(bird.card, "focusin");
  assert.equal(bird.dataset.detailState, "rest");
  f.event(bird.card, "focusout", { relatedTarget: null });
  f.event(bird.card, "focusin");
  assert.equal(bird.dataset.detailState, "playing");
});

test("reduced motion, forced colors, hidden/offscreen scenes and blur cancel transient work without replay", () => {
  for (const stop of [
    f => { f.reduced.matches = true; f.reduced.dispatchEvent(new Event("change")); },
    f => { f.forced.matches = true; f.forced.dispatchEvent(new Event("change")); },
    f => { f.doc.hidden = true; f.doc.dispatchEvent(new Event("visibilitychange")); },
    f => f.visible(false),
    f => f.view.dispatchEvent(new Event("blur")),
    f => f.event(f.button("chair"), "pointercancel"),
  ]) {
    const f = fixture();
    f.visible();
    f.hover("chair");
    stop(f);
    assert.equal(f.timers.size, 0);
    assert.equal(f.button("chair").dataset.detailState, "rest");
    f.doc.hidden = false;
    f.doc.documentElement.dataset.rain = "moving";
    f.reduced.matches = false;
    f.forced.matches = false;
    f.visible();
    assert.equal(f.timers.size, 0);
  }
});

test("reduced-motion flower feedback is instant, while hidden/offscreen flowers do not bloom", () => {
  const f = fixture();
  f.visible();
  f.reduced.matches = true;
  f.hover("flower");
  assert.equal(f.button("flower").dataset.detailState, "still-bloom");
  assert.equal(f.timers.size, 0);
  f.doc.hidden = true;
  f.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.button("flower").dataset.detailState, "still-rest");
  assert.equal(f.button("flower").attributes["aria-pressed"], "false");
  f.doc.hidden = false;
  f.visible(false);
  f.event(f.button("flower"), "click");
  assert.equal(f.button("flower").dataset.detailState, "still-rest");
});

test("manual scene motion works with rain paused, without enabling rain or sound", () => {
  const f = fixture();
  f.doc.documentElement.dataset.rain = "still";
  f.doc.documentElement.dataset.sound = "off";
  f.visible();
  for (const kind of ["chair", "steam", "plant", ...projects, "embers"]) {
    f.hover(kind);
    assert.equal(f.button(kind).dataset.detailState, "playing");
  }
  f.hover("flower");
  assert.equal(f.button("flower").dataset.detailState, "bloom");
  assert.equal(f.button("flower").dataset.butterfly, "arriving");
  f.advance(3600);
  assert.equal(f.timers.size, 0);
  assert.equal(f.button("flower").dataset.butterfly, "perched");
  assert.equal(f.doc.documentElement.dataset.rain, "still");
  assert.equal(f.doc.documentElement.dataset.sound, "off");
});

test("each project card supports focus on its links as well as native icon activation", () => {
  for (const kind of projects) {
    const f = fixture();
    f.visible();
    const button = f.button(kind);
    f.event(button.card, "focusin");
    assert.equal(button.dataset.detailState, "playing");
    assert.equal(f.event(button, "click").defaultPrevented, false);
    assert.equal(f.timers.size, 1);
    f.event(button.card, "focusout", { relatedTarget: null });
    f.advance(3600);
    assert.equal(button.dataset.detailState, "rest");
  }
});
