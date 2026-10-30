import test from "node:test";
import assert from "node:assert/strict";
import { installListening } from "../public/listening.js";

function fixture({ recent } = {}) {
  const doc = new EventTarget();
  const elements = new Map();
  class Element extends EventTarget {
    hidden = true;
    dataset = {};
    attributes = new Map();
    textContent = "";
    children = [];
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    getBoundingClientRect() { return { top: 200, bottom: 250 }; }
    contains(target) { return target === this; }
    focus() { doc.activeElement = this; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
  }
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const corner = element("[data-listening]");
  const card = element(".listening-card");
  corner.querySelector = card.querySelector = element;
  corner.contains = (target) => [...elements.values()].includes(target);
  const logo = element("[data-listening-logo]");
  logo.dataset.listeningLogo = "https://example.test/spotify.svg";
  doc.querySelector = element;
  doc.createElement = () => new Element();
  doc.activeElement = {};
  doc.hidden = false;
  let sequence = 0;
  let calls = 0;
  const timers = new Map();
  doc.defaultView = {
    AbortSignal,
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener() {},
    async fetch() {
      calls++;
      return Response.json({
        state: "playing",
        track: { title: "Test song", artists: "Test artist", album: "Test album", image: "https://i.scdn.co/image/test", url: "https://open.spotify.com/track/test123", playedAt: null },
        ...(recent !== undefined ? { recent } : {}),
      });
    },
  };
  installListening(doc);
  const motion = (active) => doc.dispatchEvent(new CustomEvent("hearth:motion", { detail: { active } }));
  async function fire(delay) {
    const timer = [...timers.entries()].find(([, timer]) => timer.delay === delay);
    assert.ok(timer, `Expected a ${delay}ms timer.`);
    timers.delete(timer[0]);
    timer[1].callback();
    for (let i = 0; i < 10; i++) await Promise.resolve();
  }
  return { doc, element, motion, timers, fire, calls: () => calls };
}

test("hearth motion never schedules unsolicited artwork or listening requests", () => {
  const { element, motion, timers, calls } = fixture();
  motion(true);
  motion(false);
  assert.equal(calls(), 0);
  assert.equal(timers.size, 0);
  assert.equal(element(".listening-card").hidden, true);
});

test("hover opens the listening card and Escape dismisses it without an automatic reopen timer", async () => {
  const { element, motion, timers, fire, calls } = fixture();
  assert.equal(calls(), 0);
  element("[data-listening]").dispatchEvent(new Event("pointerenter"));
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(calls(), 1);
  assert.equal(element(".listening-card").hidden, false);
  assert.equal(element("[data-listening-title]").textContent, "Test song");
  assert.equal(element("[data-listening-status]").getAttribute("aria-live"), "polite");
  assert.equal(element("[data-listening-cover]").hidden, false);
  assert.ok(![...timers.values()].some(timer => [42000, 6500].includes(timer.delay)));
});

test("manual card never takes focus, closes on Escape, and cancels polling while hidden", async () => {
  const { doc, element, motion, timers, fire, calls } = fixture();
  const focus = doc.activeElement;
  element("[data-listening]").dispatchEvent(new Event("focusin"));
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(doc.activeElement, focus);
  doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
  assert.equal(element(".listening-card").hidden, true);
  assert.equal(timers.size, 0);
  doc.hidden = true;
  doc.dispatchEvent(new Event("visibilitychange"));
  motion(true);
  assert.equal(timers.size, 0);
  assert.equal(calls(), 1);
});

test("the optional official player loads only on explicit request and is removed when dismissed", async () => {
  const { doc, element } = fixture();
  element("[data-listening]").dispatchEvent(new Event("pointerenter"));
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const preview = element(".spotify-preview");
  assert.equal(preview.src, undefined);
  assert.equal(preview.hidden, true);
  element(".spotify-preview-toggle").dispatchEvent(new Event("click"));
  assert.equal(preview.src, "https://open.spotify.com/embed/track/test123");
  assert.equal(preview.hidden, false);
  doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
  assert.equal(preview.hidden, true);
  assert.equal(element(".listening-card").hidden, true);
});

test("recent tracks render as three ordinary linked records and retain stationary original metadata", async () => {
  const recent = [1, 2, 3].map(id => ({
    title: `Song ${id}`, artists: `Artist ${id}`, album: `Album ${id}`,
    image: `https://i.scdn.co/image/test${id}`, url: `https://open.spotify.com/track/test${id}`, playedAt: "2026-10-29T10:00:00Z",
  }));
  const { element } = fixture({ recent });
  element("[data-listening]").dispatchEvent(new Event("pointerenter"));
  for (let i = 0; i < 15; i++) await Promise.resolve();
  assert.equal(element(".recent-shelf").hidden, false);
  const items = element(".recent-records").children;
  assert.equal(items.length, 3);
  for (let i = 0; i < 3; i++) {
    const link = items[i].children[0];
    assert.equal(link.href, recent[i].url);
    assert.equal(link.children[0].src, recent[i].image);
    assert.equal(link.children[0].width, 56);
    assert.equal(link.children[1].textContent, recent[i].title);
    assert.equal(link.children[2].textContent, recent[i].artists);
  }
});

test("an old deployed API remains usable during rollout, without inventing a recent shelf", async () => {
  const { element } = fixture();
  element("[data-listening]").dispatchEvent(new Event("pointerenter"));
  for (let i = 0; i < 15; i++) await Promise.resolve();
  assert.equal(element(".recent-shelf").hidden, true);
  assert.equal(element(".recent-records").children.length, 0);
  assert.equal(element("[data-listening-title]").textContent, "Test song");
});
