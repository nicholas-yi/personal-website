import test from "node:test";
import assert from "node:assert/strict";
import { installHearth } from "../public/hearth.js";

function fixture() {
  const doc = new EventTarget();
  const reduced = new EventTarget();
  reduced.matches = false;
  doc.hidden = false;
  doc.documentElement = { dataset: { rain: "moving" } };
  const hearth = new EventTarget();
  hearth.dataset = {};
  const events = [];
  hearth.addEventListener("hearth:motion", (event) => events.push(event.detail.active));
  const callbacks = {};
  doc.querySelector = () => hearth;
  doc.defaultView = {
    CustomEvent,
    matchMedia: () => reduced,
    IntersectionObserver: class {
      constructor(callback, options) { callbacks.visible = callback; callbacks.threshold = options.threshold; }
      observe(target) { assert.equal(target, hearth); }
    },
    MutationObserver: class {
      constructor(callback) { callbacks.weather = callback; }
      observe(target, options) {
        assert.equal(target, doc.documentElement);
        assert.deepEqual(options.attributeFilter, ["data-rain"]);
      }
    },
  };
  installHearth(doc);
  return { doc, reduced, hearth, events, callbacks };
}

test("hearth motion requires visible fireplace, active weather, visible document, and no reduced-motion preference", () => {
  const { doc, reduced, hearth, callbacks } = fixture();
  assert.equal(hearth.dataset.motion, "still");
  assert.equal(callbacks.threshold, 0.25);
  callbacks.visible([{ isIntersecting: true }]);
  assert.equal(hearth.dataset.motion, "moving");
  doc.documentElement.dataset.rain = "still";
  callbacks.weather();
  assert.equal(hearth.dataset.motion, "still");
  doc.documentElement.dataset.rain = "moving";
  callbacks.weather();
  assert.equal(hearth.dataset.motion, "moving");
  reduced.matches = true;
  reduced.dispatchEvent(new Event("change"));
  assert.equal(hearth.dataset.motion, "still");
  reduced.matches = false;
  reduced.dispatchEvent(new Event("change"));
  doc.hidden = true;
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(hearth.dataset.motion, "still");
  doc.hidden = false;
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(hearth.dataset.motion, "moving");
  callbacks.visible([{ isIntersecting: false }]);
  assert.equal(hearth.dataset.motion, "still");
});

test("motion events are emitted only for actual state changes and pages without companions are unchanged", () => {
  const { hearth, events, callbacks } = fixture();
  assert.deepEqual(events, [false]);
  callbacks.weather();
  callbacks.weather();
  assert.deepEqual(events, [false]);
  callbacks.visible([{ isIntersecting: true }]);
  callbacks.visible([{ isIntersecting: true }]);
  assert.deepEqual(events, [false, true]);
  assert.equal(hearth.dataset.motion, "moving");
  assert.equal(installHearth({ querySelector: () => null }), undefined);
});
