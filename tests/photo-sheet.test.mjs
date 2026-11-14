import test from "node:test";
import assert from "node:assert/strict";
import { installPhotoSheet } from "../public/photo-sheet.js";

function fixture() {
  const doc = new EventTarget();
  doc.hidden = false;
  const corner = new EventTarget();
  corner.dataset = {};
  const engagement = new EventTarget();
  const trigger = new EventTarget();
  trigger.hidden = true;
  trigger.attributes = {};
  trigger.setAttribute = (key, value) => { trigger.attributes[key] = value; };
  const panel = { hidden: true };
  const status = { textContent: "" };
  const choices = Array.from({ length: 3 }, (_, index) => {
    const button = new EventTarget();
    button.dataset = { photoSelect: String(index) };
    button.attributes = {};
    button.setAttribute = (key, value) => { button.attributes[key] = value; };
    return button;
  });
  const photos = Array.from({ length: 3 }, () => ({ hidden: true }));
  corner.contains = element => element === corner || element === trigger || panel.contains(element);
  engagement.contains = element => element === engagement || element === trigger || panel.contains(element);
  panel.contains = element => element === panel || choices.includes(element);
  doc.activeElement = null;
  const elements = {
    ".picture-art": corner, ".photo-sheet": engagement, ".photo-sheet-toggle": trigger, ".photo-sheet-panel": panel,
    ".photo-sheet-status": status,
  };
  const frame = {
    querySelector: selector => elements[selector] ?? null,
    querySelectorAll: selector => selector === "[data-photo-select]" ? choices : photos,
  };
  doc.querySelector = () => frame;
  const timers = new Map();
  let sequence = 0;
  let now = 0;
  const view = new EventTarget();
  Object.assign(view, {
    setTimeout(callback, delay) {
      const id = ++sequence;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  doc.defaultView = view;
  const send = (target, type, values = {}) => {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event);
    return event;
  };
  trigger.focus = () => {
    doc.activeElement = trigger;
    send(engagement, "focusin");
  };
  installPhotoSheet(doc);
  return {
    doc, view, corner, engagement, trigger, panel, choices, photos, status, elements, timers, send,
    enter() { send(engagement, "pointerenter", { pointerType: "mouse" }); },
    leave() { send(engagement, "pointerleave", { pointerType: "mouse" }); },
    advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of timers) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.callback();
      }
    },
  };
}

test("contact sheets enable one trigger without a separate close control and leave other pages unchanged", () => {
  const f = fixture();
  assert.equal(f.trigger.hidden, false);
  assert.equal(f.panel.hidden, true);
  assert.equal(f.trigger.attributes["aria-expanded"], "false");
  assert.deepEqual(f.photos.map(photo => photo.hidden), [false, true, true]);
  assert.equal(f.status.textContent, "frame 01 of 03");
  assert.equal(f.timers.size, 0);
  assert.equal(installPhotoSheet({ querySelector: () => null }), undefined);
});

test("hover opens a sheet and pointer re-entry cancels its bounded grace-period close", () => {
  const f = fixture();
  f.enter();
  assert.equal(f.panel.hidden, false);
  assert.equal(f.corner.dataset.sheet, "open");
  assert.equal(f.trigger.attributes["aria-pressed"], "false");
  f.leave();
  assert.equal(f.timers.size, 1);
  f.advance(239);
  assert.equal(f.panel.hidden, false);
  f.enter();
  f.advance(1000);
  assert.equal(f.panel.hidden, false);
  assert.equal(f.timers.size, 0);
  f.leave();
  f.advance(240);
  assert.equal(f.panel.hidden, true);
  assert.equal(f.timers.size, 0);
});

test("native click pins a hover preview and photo choices select exactly one frame", () => {
  const f = fixture();
  f.enter();
  assert.equal(f.send(f.trigger, "click").defaultPrevented, false);
  f.leave();
  f.advance(1000);
  assert.equal(f.panel.hidden, false);
  assert.equal(f.trigger.attributes["aria-pressed"], "true");
  for (let index = 0; index < 30; index++) {
    const selected = index % 3;
    f.send(f.choices[selected], "click");
    assert.equal(f.photos.filter(photo => !photo.hidden).length, 1);
    assert.equal(f.photos[selected].hidden, false);
    assert.equal(f.choices.filter(choice => choice.attributes["aria-pressed"] === "true").length, 1);
  }
  assert.equal(f.status.textContent, "frame 03 of 03");
  assert.equal(f.timers.size, 0);
  f.send(f.trigger, "click");
  assert.equal(f.panel.hidden, true);
});

test("keyboard focus keeps the panel open across controls and Escape returns focus without reopening", () => {
  const f = fixture();
  f.trigger.focus();
  assert.equal(f.panel.hidden, false);
  f.send(f.engagement, "focusout", { relatedTarget: f.choices[1] });
  f.leave();
  f.advance(1000);
  assert.equal(f.panel.hidden, false);
  f.doc.activeElement = f.choices[1];
  assert.equal(f.send(f.doc, "keydown", { key: "Escape" }).defaultPrevented, true);
  assert.equal(f.doc.activeElement, f.trigger);
  assert.equal(f.panel.hidden, true);
  f.leave();
  assert.equal(f.panel.hidden, true);
  assert.equal(f.send(f.doc, "keydown", { key: "Escape" }).defaultPrevented, false);
  f.send(f.engagement, "focusout", { relatedTarget: null });
  f.trigger.focus();
  assert.equal(f.panel.hidden, false);
});

test("outside input, window blur and hidden documents dismiss pinned sheets", () => {
  for (const dismiss of [
    f => f.send(f.doc, "pointerdown", { target: {} }),
    f => f.view.dispatchEvent(new Event("blur")),
    f => { f.doc.hidden = true; f.doc.dispatchEvent(new Event("visibilitychange")); },
  ]) {
    const f = fixture();
    f.send(f.trigger, "click");
    assert.equal(f.panel.hidden, false);
    dismiss(f);
    assert.equal(f.panel.hidden, true);
    assert.equal(f.trigger.attributes["aria-pressed"], "false");
    assert.equal(f.timers.size, 0);
  }
});

test("touch hover does not open the sheet but native tap and inside input remain usable", () => {
  const f = fixture();
  f.send(f.engagement, "pointerenter", { pointerType: "touch" });
  assert.equal(f.panel.hidden, true);
  f.send(f.trigger, "click");
  f.send(f.doc, "pointerdown", { target: f.choices[2] });
  assert.equal(f.panel.hidden, false);
  f.send(f.choices[2], "click");
  assert.equal(f.photos[2].hidden, false);
  assert.equal(f.timers.size, 0);
});

test("portrait hover and focus do not open the contact sheet; only the separate tab or panel do", () => {
  const f = fixture();
  f.send(f.corner, "pointerenter", { pointerType: "mouse" });
  f.send(f.corner, "focusin");
  assert.equal(f.panel.hidden, true);
  assert.equal(f.timers.size, 0);
  f.enter();
  assert.equal(f.panel.hidden, false);
  f.leave();
  f.advance(240);
  assert.equal(f.panel.hidden, true);
});

test("broken or misnumbered sheet markup fails explicitly instead of exposing a partial gallery", () => {
  const f = fixture();
  f.choices[1].dataset.photoSelect = "7";
  assert.throws(() => installPhotoSheet(f.doc), /matching photo slots/);
  delete f.elements[".photo-sheet-panel"];
  assert.throws(() => installPhotoSheet(f.doc), /contact sheet needs/);
});
