import test from "node:test";
import assert from "node:assert/strict";
import { createGlassField, paintGlassSegment, writeGlassMask, glassMarkStrength, GLASS_MARK_LIFETIME, GLASS_FOG_DELAY, installHeaderGlass } from "../public/header-glass.js";

function fixture({ missing = false, canvasSupport = true } = {}) {
  const doc = new EventTarget();
  doc.hidden = false;
  doc.documentElement = { dataset: { rain: "moving" } };
  const header = new EventTarget();
  header.dataset = {};
  header.closest = () => null;
  header.querySelectorAll = () => [];
  let bounds = { left: 20, top: 0, width: 900, height: 82 };
  header.getBoundingClientRect = () => bounds;
  header.prepend = element => { header.canvas = element; };
  doc.querySelector = () => missing ? null : header;
  const contexts = [];
  const colors = { "--glass-fog-rgb": "232, 236, 223", "--glass-light-rgb": "255, 255, 250", "--glass-dew-rgb": "116, 135, 120" };
  doc.createElement = () => {
    const calls = [];
    const context = { calls };
    for (const name of ["save", "restore", "translate", "rotate", "scale", "beginPath", "ellipse", "arc", "rect", "clip", "fill", "stroke", "moveTo", "lineTo", "quadraticCurveTo", "setTransform", "clearRect", "drawImage", "fillRect"]) {
      context[name] = (...args) => calls.push({ name, args, width: context.lineWidth, alpha: context.globalAlpha, fillStyle: context.fillStyle });
    }
    context.createRadialGradient = (...args) => {
      const gradient = { stops: [], addColorStop(offset, color) { this.stops.push([offset, color]); } };
      calls.push({ name: "radialGradient", args, gradient });
      return gradient;
    };
    context.createImageData = (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) });
    context.putImageData = (...args) => calls.push({ name: "putImageData", args });
    contexts.push(context);
    return { getContext: () => canvasSupport ? context : null, setAttribute() {} };
  };
  const reduced = new EventTarget();
  reduced.matches = false;
  const forced = new EventTarget();
  forced.matches = false;
  const frames = new Map();
  const observers = {};
  let sequence = 0;
  let time = 0;
  const view = new EventTarget();
  Object.assign(view, {
    devicePixelRatio: 3,
    performance: { now: () => time },
    getComputedStyle: () => ({ getPropertyValue: key => colors[key] }),
    matchMedia: query => query.includes("reduced") ? reduced : forced,
    requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    MutationObserver: class {
      constructor(callback) { observers.motion = callback; }
      observe(target, options) {
        assert.equal(target, doc.documentElement);
        assert.deepEqual(options.attributeFilter, ["data-rain"]);
      }
    },
    ResizeObserver: class {
      constructor(callback) { observers.resize = callback; }
      observe(target) { assert.equal(target, header); }
    },
  });
  doc.defaultView = view;
  installHeaderGlass(doc);
  return {
    doc, view, header, reduced, forced, frames, contexts, observers, colors,
    setBounds(next) { bounds = next; },
    setTime(now) { time = now; },
    pointer(type, values = {}) {
      const event = new Event(type, { cancelable: true });
      for (const [key, value] of Object.entries({ pointerType: "mouse", clientX: 120, clientY: 40, button: 0, ...values })) {
        Object.defineProperty(event, key, { value });
      }
      header.dispatchEvent(event);
      return event;
    },
    step(now) {
      time = now;
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback(now);
    },
    draws() { return contexts[0].calls.filter(call => call.name === "clearRect").length; },
  };
}

function pixelsFor(field) { return new Uint8ClampedArray(field.width * field.height * 4); }
function clarityAt(field, pixels, x, y) {
  return pixels[(Math.round(y * 0.5) * field.width + Math.round(x * 0.5)) * 4 + 3];
}

test("the head holds briefly, then refogs completely at the requested 8.8 seconds", () => {
  const mark = { time: 100 };
  assert.equal(GLASS_MARK_LIFETIME, 8800);
  assert.ok(glassMarkStrength(mark, 100 + 1600) > 0.9);
  assert.ok(glassMarkStrength(mark, 100 + 8700) > 0);
  assert.equal(glassMarkStrength(mark, 100), 1);
  assert.equal(glassMarkStrength(mark, 100 + GLASS_FOG_DELAY), 1);
  assert.equal(glassMarkStrength(mark, 100 + GLASS_FOG_DELAY + (GLASS_MARK_LIFETIME - GLASS_FOG_DELAY) / 2), 0.5);
  assert.equal(glassMarkStrength(mark, 100 + GLASS_MARK_LIFETIME), 0);
  assert.equal(glassMarkStrength(mark, 10000), 0);
  assert.equal(glassMarkStrength(mark, 0), 1);
  let previous = 1;
  for (let time = 100; time <= 100 + GLASS_MARK_LIFETIME; time += 10) {
    const strength = glassMarkStrength(mark, time);
    assert.ok(strength >= 0 && strength <= previous);
    previous = strength;
  }
  assert.throws(() => glassMarkStrength({}, 0), TypeError);
  assert.throws(() => glassMarkStrength(mark, NaN), TypeError);
});

test("the first wiped area survives arbitrary cursor travel instead of a distance or sample cutoff", () => {
  const field = createGlassField(1000, 80, 25);
  const pixels = pixelsFor(field);
  paintGlassSegment(field, { x: 30, y: 40 }, { x: 110, y: 40 }, 0);
  for (let index = 0; index < 200; index++) {
    paintGlassSegment(field, { x: 400, y: 25 }, { x: 900, y: 55 }, 1000 + index);
  }
  writeGlassMask(field, pixels, 1200);
  assert.ok(clarityAt(field, pixels, 60, 40) > 230);
  assert.ok(clarityAt(field, pixels, 800, 49) > 230);
  writeGlassMask(field, pixels, 8800);
  assert.equal(clarityAt(field, pixels, 60, 40), 0);
  assert.ok(clarityAt(field, pixels, 800, 49) > 0);
});

test("older areas re-fog independently while revisiting refreshes only the area touched again", () => {
  const field = createGlassField(900, 80, 20);
  const pixels = pixelsFor(field);
  paintGlassSegment(field, { x: 30, y: 40 }, { x: 120, y: 40 }, 0);
  paintGlassSegment(field, { x: 600, y: 40 }, { x: 800, y: 40 }, 4000);
  writeGlassMask(field, pixels, 4100);
  assert.ok(clarityAt(field, pixels, 60, 40) < clarityAt(field, pixels, 700, 40));
  paintGlassSegment(field, { x: 50, y: 40 }, { x: 70, y: 40 }, 5000);
  writeGlassMask(field, pixels, 9000);
  assert.ok(clarityAt(field, pixels, 60, 40) > 0);
  assert.equal(clarityAt(field, pixels, 100, 40), 0);
});

test("the brush remains 50 percent wider, feathered, and over 95 percent clear at its center", () => {
  const field = createGlassField(900, 82, Math.max(32, 82 * 0.56) * 1.5 / 2);
  const pixels = pixelsFor(field);
  assert.equal(field.radius, Math.max(32, 82 * 0.56) * 1.5 / 4);
  paintGlassSegment(field, { x: 100, y: 40 }, { x: 700, y: 40 }, 0);
  writeGlassMask(field, pixels, 0);
  assert.ok(clarityAt(field, pixels, 400, 40) / 255 > 0.95);
  assert.ok(clarityAt(field, pixels, 400, 68) > 0);
  assert.equal(clarityAt(field, pixels, 400, 78), 0);
  const f = fixture();
  const frost = f.contexts[1].calls.find(call => call.name === "fillRect");
  const frostAlpha = Number(frost.fillStyle.match(/, ([\d.]+)\)$/)[1]);
  assert.ok(Math.abs((0.12 + (1 - 0.12) * frostAlpha) - 0.925) < 1e-12);
});

test("fixed field storage stays bounded after many wipes without evicting valid history", () => {
  const field = createGlassField(1028, 82, 34);
  const clarity = field.clarity;
  const time = field.time;
  for (let index = 0; index < 300; index++) {
    paintGlassSegment(field, { x: 100, y: 40 }, { x: 900, y: 40 }, index);
  }
  assert.equal(field.clarity, clarity);
  assert.equal(field.time, time);
  assert.ok(field.active <= field.width * field.height);
  assert.equal(field.clarity.length, 514 * 41);
  const pixels = pixelsFor(field);
  assert.equal(writeGlassMask(field, pixels, 10000), false);
  assert.equal(field.active, 0);
  assert.ok(pixels.every(value => value === 0));
});

test("sparse and coalesced movement paints a continuous mask with no gaps", () => {
  const field = createGlassField(900, 80, 25);
  const pixels = pixelsFor(field);
  paintGlassSegment(field, { x: 20, y: 40 }, { x: 880, y: 40 }, 0);
  writeGlassMask(field, pixels, 0);
  for (let x = 30; x <= 870; x += 2) assert.ok(clarityAt(field, pixels, x, 40) > 240);
  const f = fixture();
  f.pointer("pointermove", { clientX: 100, clientY: 40 });
  f.contexts[0].calls.length = 0;
  f.pointer("pointermove", {
    clientX: 700, clientY: 40,
    getCoalescedEvents: () => [{ clientX: 300, clientY: 20 }, { clientX: 500, clientY: 60 }, { clientX: 700, clientY: 40 }],
  });
  f.step(50);
  assert.ok(f.contexts[2].calls.some(call => call.name === "putImageData"));
  const mask = f.contexts[2].calls.find(call => call.name === "putImageData").args[0].data;
  assert.ok(mask.some(value => value > 0));
});

test("leaving and re-entering the banner never draws a line across the unvisited gap", () => {
  const f = fixture();
  f.pointer("pointermove", { clientX: 100 });
  f.pointer("pointermove", { clientX: 200 });
  f.step(0);
  f.pointer("pointerleave");
  f.pointer("pointermove", { clientX: 700 });
  f.pointer("pointermove", { clientX: 800 });
  f.contexts[0].calls.length = 0;
  f.step(50);
  const mask = f.contexts[2].calls.at(-1).args[0].data;
  assert.ok(mask[(20 * 450 + 60) * 4 + 3] > 0);
  assert.equal(mask[(20 * 450 + 225) * 4 + 3], 0);
  assert.ok(mask[(20 * 450 + 360) * 4 + 3] > 0);
});

test("invalid field sizes, pointer input and pixel buffers fail explicitly", () => {
  for (const width of [0, -1, NaN]) assert.throws(() => createGlassField(width, 80, 20), TypeError);
  const field = createGlassField(500, 80, 20);
  assert.throws(() => paintGlassSegment(field, null, { x: 30, y: 40 }, 0), TypeError);
  assert.throws(() => paintGlassSegment(field, { x: -1, y: 40 }, { x: 30, y: 40 }, 0), RangeError);
  assert.throws(() => writeGlassMask(field, new Uint8ClampedArray(4), 0), TypeError);
  assert.equal(paintGlassSegment(field, { x: 30, y: 40 }, { x: 30, y: 40 }, 0), false);
});

test("the header is drawn once at rest without a handprint, with capped density and no idle frame", () => {
  const { header, frames, draws, observers, contexts } = fixture();
  assert.equal(header.dataset.glass, "ready");
  assert.equal(header.canvas.className, "header-glass");
  assert.equal(header.canvas.width, 1350);
  assert.equal(header.canvas.height, 123);
  assert.equal(draws(), 1);
  assert.equal(frames.size, 0);
  assert.ok(!contexts[0].calls.some(call => ["ellipse", "stroke", "lineTo", "rotate"].includes(call.name)));
  observers.resize();
  assert.equal(draws(), 1);
});

test("theme changes recolor cached fog once without restarting a paused wipe", () => {
  const f = fixture();
  f.doc.documentElement.dataset.rain = "still";
  f.contexts[1].calls.length = 0;
  f.colors["--glass-fog-rgb"] = "58, 51, 40";
  f.view.dispatchEvent(new Event("themechange"));
  const paint = f.contexts[1].calls.find(call => call.name === "fillRect");
  assert.ok(paint.fillStyle.startsWith("rgba(58, 51, 40,"));
  assert.equal(f.frames.size, 0);
  assert.equal(f.draws(), 2);
});

test("changing lamp palette preserves a wipe's original timestamps and remaining lifetime", () => {
  const f = fixture();
  f.pointer("pointermove");
  f.pointer("pointermove", { clientX: 180 });
  f.step(0);
  const pixels = f.contexts[2].calls.at(-1).args[0].data;
  f.setTime(4400);
  f.colors["--glass-fog-rgb"] = "58, 51, 40";
  f.view.dispatchEvent(new Event("themechange"));
  assert.equal(f.contexts[2].calls.at(-1).args[0].data, pixels);
  assert.ok(pixels[(20 * 450 + 65) * 4 + 3] > 0);
  assert.equal(f.frames.size, 1);
  f.step(GLASS_MARK_LIFETIME);
  assert.equal(pixels[(20 * 450 + 65) * 4 + 3], 0);
  assert.equal(f.frames.size, 0);
});

test("pointer bursts schedule one frame and remisting stops completely when settled", () => {
  const f = fixture();
  for (let index = 0; index < 50; index++) f.pointer("pointermove", { clientX: 100 + index * 2 });
  assert.equal(f.frames.size, 1);
  f.step(0);
  assert.equal(f.draws(), 2);
  f.step(20);
  assert.equal(f.draws(), 2);
  f.step(50);
  assert.equal(f.draws(), 3);
  f.step(GLASS_MARK_LIFETIME + 100);
  assert.equal(f.frames.size, 0);
});

test("clearing extends behind navigation instead of reserving blocking fog rectangles", () => {
  const f = fixture();
  f.header.querySelectorAll = () => [{ getBoundingClientRect: () => ({ left: 700, top: 18, width: 200, height: 44 }) }];
  f.setBounds({ left: 20, top: 0, width: 901, height: 82 });
  f.observers.resize();
  f.pointer("pointermove", { clientX: 710 });
  f.pointer("pointermove", { clientX: 850 });
  f.step(0);
  assert.ok(!f.contexts[0].calls.some(call => call.name === "clip"));
  assert.ok(f.contexts[2].calls.some(call => call.name === "putImageData"));
});

test("hidden tabs, forced colors, blur and pointer cancellation stop transient work", () => {
  for (const stop of [
    f => { f.forced.matches = true; f.forced.dispatchEvent(new Event("change")); },
    f => { f.doc.hidden = true; f.doc.dispatchEvent(new Event("visibilitychange")); },
    f => f.view.dispatchEvent(new Event("blur")),
    f => f.pointer("pointercancel"),
  ]) {
    const f = fixture();
    f.pointer("pointermove");
    f.pointer("pointermove", { clientX: 180 });
    f.step(0);
    assert.equal(f.frames.size, 1);
    stop(f);
    assert.equal(f.frames.size, 0);
  }
});

test("manual wiping and the full 8.8-second refog work with every atmosphere setting and reduced motion", () => {
  for (const rain of ["still", "moving"]) {
    for (const theme of ["daylight", "lamplight"]) {
      for (const sound of ["off", "on"]) {
        const f = fixture();
        Object.assign(f.doc.documentElement.dataset, { rain, theme, sound });
        f.reduced.matches = true;
        f.pointer("pointermove");
        f.pointer("pointermove", { clientX: 180 });
        f.step(0);
        const pixels = f.contexts[2].calls.at(-1).args[0].data;
        const alpha = () => pixels[(20 * 450 + 65) * 4 + 3];
        assert.ok(alpha() / 255 > 0.95);
        f.doc.documentElement.dataset.rain = rain === "still" ? "moving" : "still";
        f.reduced.dispatchEvent(new Event("change"));
        assert.equal(f.frames.size, 1);
        f.step(4400);
        assert.ok(alpha() > 0 && alpha() < 248);
        f.step(GLASS_MARK_LIFETIME - 25);
        assert.equal(f.frames.size, 1);
        f.step(GLASS_MARK_LIFETIME);
        assert.equal(alpha(), 0);
        assert.equal(f.frames.size, 0);
      }
    }
  }
});

test("one isolated sample does not make a dot or leave an invisible animation loop running", () => {
  const f = fixture();
  f.pointer("pointermove");
  assert.equal(f.frames.size, 0);
  assert.equal(f.contexts[0].calls.filter(call => call.name === "stroke").length, 0);
});

test("touch scrolling, links, and empty-space presses never stamp the glass", () => {
  const f = fixture();
  f.pointer("pointermove", { pointerType: "touch" });
  assert.equal(f.frames.size, 0);
  const link = f.pointer("pointerdown", { target: { closest: () => ({}) } });
  assert.equal(link.defaultPrevented, false);
  assert.equal(f.frames.size, 0);
  const press = f.pointer("pointerdown", { pointerType: "touch" });
  assert.equal(press.defaultPrevented, false);
  assert.equal(f.frames.size, 0);
  f.pointer("pointerdown");
  assert.equal(f.frames.size, 0);
  assert.equal(f.draws(), 1);
  f.pointer("pointermove");
  assert.equal(f.frames.size, 0);
  f.pointer("pointermove", { clientX: 180 });
  assert.equal(f.frames.size, 1);
  f.step(0);
  f.setBounds({ left: 10, top: 0, width: 300, height: 78 });
  f.observers.resize();
  assert.equal(f.frames.size, 0);
  assert.equal(f.header.canvas.width, 450);
});

test("missing headers do nothing and unsupported canvas keeps the static banner with an explicit warning", () => {
  assert.equal(fixture({ missing: true }).contexts.length, 0);
  const warn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(message);
  try {
    const f = fixture({ canvasSupport: false });
    assert.equal(f.header.dataset.glass, undefined);
    assert.equal(f.header.canvas, undefined);
    assert.equal(f.frames.size, 0);
    assert.match(warnings[0], /static banner is unchanged/);
  } finally { console.warn = warn; }
});
