import test from "node:test";
import assert from "node:assert/strict";
import { createRainGlyphs } from "../public/rain-glyphs.js";
import { RAIN_GLYPHS, RAIN_INK } from "../public/rain.js";

test("the rain atlas renders each glyph once, then uses image blits for every drop", () => {
  const written = [];
  const transforms = [];
  const context = { setTransform: (...args) => transforms.push(args), fillText: (...args) => written.push(args) };
  const canvas = { getContext: () => context };
  const doc = { createElement: (tag) => { assert.equal(tag, "canvas"); return canvas; } };
  const atlas = createRainGlyphs(doc, 1.5);
  assert.deepEqual(written.map(args => args[0]), [...new Set([...RAIN_GLYPHS, "o", "/", "\\"])]);
  assert.equal(context.fillStyle, RAIN_INK);
  assert.deepEqual(transforms, [[1.5, 0, 0, 1.5, 0, 0]]);
  const blits = [];
  const target = { drawImage: (...args) => blits.push(args) };
  for (let frame = 0; frame < 100; frame++) for (const glyph of RAIN_GLYPHS) atlas.draw(target, glyph, 200, 300);
  assert.equal(written.length, 10);
  assert.equal(blits.length, 700);
  assert.ok(blits.every(call => call[0] === canvas && call.slice(5).join(",") === "188,286,24,28"));
  assert.throws(() => atlas.draw(target, "unexpected", 0, 0), RangeError);
});

test("missing canvas support is explicit rather than a silent missing rain layer", () => {
  assert.throws(() => createRainGlyphs({ createElement: () => ({ getContext: () => null }) }, 1), /canvas support/);
});

test("the atlas accepts a palette ink without changing glyph coverage or adding per-drop color work", () => {
  const context = { setTransform() {}, fillText() {} };
  createRainGlyphs({ createElement: () => ({ getContext: () => context }) }, 1, "#b8b39c");
  assert.equal(context.fillStyle, "#b8b39c");
});
