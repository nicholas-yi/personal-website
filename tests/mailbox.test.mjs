import test from "node:test";
import assert from "node:assert/strict";
import { installMailbox } from "../public/mailbox.js";

function fixture() {
  const doc = new EventTarget();
  doc.hidden = false;
  const scene = { dataset: { motion: "moving" } };
  const mailbox = new EventTarget();
  mailbox.dataset = {};
  mailbox.closest = () => scene;
  mailbox.contains = (target) => target === mailbox;
  doc.querySelector = () => mailbox;
  const reduced = new EventTarget();
  reduced.matches = false;
  const timers = new Map();
  let sequence = 0;
  let motion;
  doc.defaultView = {
    matchMedia: () => reduced,
    setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    MutationObserver: class { constructor(callback) { motion = callback; } observe() {} },
  };
  installMailbox(doc);
  return {
    doc, mailbox, reduced, scene, timers, update: () => motion(),
    finish(delay) {
      const found = [...timers.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(found, `Missing ${delay}ms phase`);
      timers.delete(found[0]);
      found[1].callback();
    },
  };
}

test("hovered mail flies in, stays perched, and flies off on leave with one bounded timer", () => {
  const { mailbox, timers, finish } = fixture();
  assert.equal(mailbox.dataset.mail, "idle");
  mailbox.dispatchEvent(new Event("pointerenter"));
  assert.equal(mailbox.dataset.mail, "arriving");
  assert.equal(timers.size, 1);
  finish(850);
  assert.equal(mailbox.dataset.mail, "perched");
  assert.equal(timers.size, 0);
  mailbox.dispatchEvent(new Event("pointerleave"));
  assert.equal(mailbox.dataset.mail, "departing");
  finish(750);
  assert.equal(mailbox.dataset.mail, "idle");
});

test("focus keeps mail perched when the pointer leaves and rapid reversals cancel old phase timers", () => {
  const { mailbox, timers, finish } = fixture();
  mailbox.dispatchEvent(new Event("pointerenter"));
  mailbox.dispatchEvent(new Event("pointerleave"));
  mailbox.dispatchEvent(new Event("focusin"));
  assert.equal(mailbox.dataset.mail, "arriving");
  assert.equal(timers.size, 1);
  finish(850);
  mailbox.dispatchEvent(new Event("pointerleave"));
  assert.equal(mailbox.dataset.mail, "perched");
  assert.equal(timers.size, 0);
  mailbox.dispatchEvent(Object.assign(new Event("focusout"), { relatedTarget: null }));
  assert.equal(mailbox.dataset.mail, "departing");
});

test("reduced motion and paused weather use instant perching; hidden tabs cancel flights", () => {
  const { doc, mailbox, reduced, scene, timers, update } = fixture();
  reduced.matches = true;
  reduced.dispatchEvent(new Event("change"));
  mailbox.dispatchEvent(new Event("focusin"));
  assert.equal(mailbox.dataset.mail, "perched");
  assert.equal(timers.size, 0);
  doc.hidden = true;
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(mailbox.dataset.mail, "idle");
  assert.equal(timers.size, 0);
  doc.hidden = false;
  scene.dataset.motion = "still";
  update();
  assert.equal(mailbox.dataset.mail, "perched");
});

test("a touch entry does not require hover and pages without mailboxes have no side effects", () => {
  const { mailbox, timers } = fixture();
  mailbox.dispatchEvent(Object.assign(new Event("pointerenter"), { pointerType: "touch" }));
  assert.equal(mailbox.dataset.mail, "idle");
  assert.equal(timers.size, 0);
  assert.equal(installMailbox({ querySelector: () => null }), undefined);
});
