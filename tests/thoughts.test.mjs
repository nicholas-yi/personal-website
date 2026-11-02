import test from "node:test";
import assert from "node:assert/strict";
import { installThoughts } from "../public/thoughts.js";
import { MAX_NODE_OFFSET } from "../public/graph-motion.js";

function fixture() {
  const doc = new EventTarget();
  doc.hidden = false;
  const reduced = new EventTarget();
  reduced.matches = false;
  const scene = { dataset: { motion: "still" } };
  const panel = { textContent: "" };
  const buttons = Array.from({ length: 3 }, (_, index) => {
    const button = new EventTarget();
    button.disabled = true;
    button.dataset = { question: `Question ${index}` };
    button.attributes = new Map();
    button.setAttribute = (name, value) => button.attributes.set(name, value);
    button.face = { style: {} };
    button.querySelector = () => button.face;
    return button;
  });
  scene.querySelectorAll = () => buttons;
  scene.querySelector = () => panel;
  doc.querySelector = () => scene;
  let observer;
  let sequence = 0;
  const frames = new Map();
  doc.defaultView = {
    matchMedia: () => reduced,
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    MutationObserver: class {
      constructor(callback) { observer = callback; }
      observe(target, options) {
        assert.equal(target, scene);
        assert.deepEqual(options.attributeFilter, ["data-motion"]);
      }
    },
  };
  installThoughts(doc);
  return {
    doc, reduced, scene, buttons, panel, frames,
    update: () => observer(),
    step(now) {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback(now);
    },
  };
}

test("rendered thought impulses stay bounded even after delayed browser frames", () => {
  const { scene, buttons, frames, update, step } = fixture();
  scene.dataset.motion = "moving";
  update();
  let time = 0;
  for (let frame = 0; frame < 3000; frame++) {
    if (frame % 80 === 0) for (const button of buttons) button.dispatchEvent(new Event("click"));
    time += frame % 25 === 0 ? 3000 : 34;
    if (frames.size) step(time);
    for (const button of buttons) {
      const [, x, y] = button.face.style.transform.match(/translate\(([-.\d]+)px, ([-.\d]+)px\)/);
      assert.ok(Math.hypot(Number(x), Number(y)) <= MAX_NODE_OFFSET + 0.02);
    }
  }
});

test("questions are enabled and respond equally to focus, hover, and click without a model call", () => {
  const { buttons, panel } = fixture();
  assert.ok(buttons.every(button => !button.disabled));
  buttons[0].dispatchEvent(new Event("focus"));
  assert.equal(panel.textContent, "Question 0");
  buttons[1].dispatchEvent(new Event("pointerenter"));
  assert.equal(panel.textContent, "Question 1");
  buttons[2].dispatchEvent(new Event("click"));
  assert.equal(panel.textContent, "Question 2");
  assert.deepEqual(buttons.map(button => button.attributes.get("aria-pressed")), ["false", "false", "true"]);
});

test("spring callbacks run only for impulses and stop at rest, pause, hidden tabs, or reduced motion", () => {
  const { doc, reduced, scene, frames, buttons, update, step } = fixture();
  assert.equal(frames.size, 0);
  scene.dataset.motion = "moving";
  update();
  update();
  assert.equal(frames.size, 0);
  buttons[0].dispatchEvent(new Event("pointerenter"));
  assert.equal(frames.size, 1);
  step(100);
  assert.ok(buttons[0].face.style.transform.includes("translate("));
  assert.equal(frames.size, 1);
  const first = buttons[0].face.style.transform;
  step(110);
  assert.equal(buttons[0].face.style.transform, first);
  doc.hidden = true;
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(frames.size, 0);
  assert.ok(buttons.every(button => button.face.style.transform === "none"));
  doc.hidden = false;
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(frames.size, 0);
  buttons[0].dispatchEvent(new Event("click"));
  assert.equal(frames.size, 1);
  reduced.matches = true;
  reduced.dispatchEvent(new Event("change"));
  assert.equal(frames.size, 0);
  reduced.matches = false;
  reduced.dispatchEvent(new Event("change"));
  assert.equal(frames.size, 0);
  buttons[0].dispatchEvent(new Event("click"));
  assert.equal(frames.size, 1);
  scene.dataset.motion = "still";
  update();
  assert.equal(frames.size, 0);
});

test("a single hover impulse settles without an endless JavaScript animation loop", () => {
  const { scene, buttons, frames, update, step } = fixture();
  scene.dataset.motion = "moving";
  update();
  buttons[1].dispatchEvent(new Event("pointerenter"));
  let time = 0;
  while (frames.size && time < 8000) { time += 40; step(time); }
  assert.equal(frames.size, 0);
  assert.ok(time < 4000);
});

test("pages without the thinking chair do not initialize animation or controls", () => {
  assert.equal(installThoughts({ querySelector: () => null }), undefined);
});
