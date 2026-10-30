import test from "node:test";
import assert from "node:assert/strict";
import { puddleGlyphs } from "../public/puddles.js";
import { createRain, stepRain } from "../public/rain.js";

test("ASCII puddles are bounded, responsive, and evolve without accumulating DOM or particles", () => {
  for (const width of [320, 390, 680, 1280]) {
    const first = puddleGlyphs(width, 0);
    const later = puddleGlyphs(width, 1);
    assert.ok(first.length > 10 && first.length < 1000);
    assert.ok(first.every(({ x, y, glyph }) => x > 0 && x < width && y >= 16 && y <= 110 && [".", "~", ":"].includes(glyph)));
    assert.notDeepEqual(first, later);
    for (let time = 0; time < 40; time += 5) assert.ok(puddleGlyphs(width, time).length < 1000);
  }
});

test("falling rain reaches the page-bottom waterline and generates expanding ASCII impact rings", () => {
  const rain = createRain(680, 950, () => 0.5);
  rain.groundY = 500;
  Object.assign(rain.drops[0], { x: 200, y: 499, vy: 300, speed: 300 });
  stepRain(rain, 0.03);
  assert.equal(rain.ripples.length, 1);
  const cells = puddleGlyphs(680, 0, rain.ripples);
  assert.ok(cells.some(cell => ["(", ")"].includes(cell.glyph)));
  assert.ok(rain.drops[0].y < 0);
});
