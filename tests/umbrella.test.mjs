import test from "node:test";
import assert from "node:assert/strict";
import { UMBRELLA_COLUMNS, UMBRELLA_FRAMES, createUmbrella, stepUmbrella, toggleUmbrella, umbrellaArt, umbrellaCanopy, umbrellaOccluded } from "../public/umbrella.js";
import { createRain, rainOpacity, stepRain, umbrellaRoofY, underUmbrella } from "../public/rain.js";

test("a click opens a bounded ASCII umbrella and a second closes it in place", () => {
  const umbrella = createUmbrella();
  assert.equal(umbrella.placed, false);
  toggleUmbrella(umbrella, 150, 200, 800, 600);
  assert.equal(umbrella.open, true);
  const frames = new Set([umbrellaArt(umbrella)]);
  for (let i = 0; i < 20; i++) { stepUmbrella(umbrella, 1 / 60); frames.add(umbrellaArt(umbrella)); }
  assert.equal(umbrella.progress, 1);
  assert.equal(frames.size, UMBRELLA_FRAMES.length);
  toggleUmbrella(umbrella, 700, 500, 800, 600);
  for (let i = 0; i < 20; i++) stepUmbrella(umbrella, 1 / 60);
  assert.equal(umbrella.open, false);
  assert.equal(umbrella.progress, 0);
  assert.equal(umbrella.x, 150);
  assert.equal(umbrella.y, 200);
  toggleUmbrella(umbrella, 500, 400, 800, 600);
  assert.equal(umbrella.x, 500);
  assert.equal(umbrella.y, 400);
});

test("reduced motion uses instant open/close and edges keep the art inside document bounds", () => {
  const umbrella = createUmbrella();
  toggleUmbrella(umbrella, -100, 1000, 320, 568, true);
  assert.equal(umbrella.progress, 1);
  assert.equal(umbrella.x, 66);
  assert.equal(umbrella.y, 503);
  assert.equal(stepUmbrella(umbrella, 0.016), false);
  toggleUmbrella(umbrella, 0, 0, 320, 568, true);
  assert.equal(umbrella.progress, 0);
  toggleUmbrella(umbrella, 900, -20, 100, 100, true);
  assert.equal(umbrella.x, 50);
  assert.equal(umbrella.y, 50);
});

test("page coordinates below the viewport remain anchored when the umbrella is closed or measured", () => {
  const umbrella = createUmbrella();
  toggleUmbrella(umbrella, 300, 1800, 800, 5000, true);
  assert.equal(umbrella.y, 1800);
  const bounds = { left: 245, right: 355, top: 1767 };
  const initial = umbrellaCanopy(umbrella, bounds, 13.8);
  const scrolled = umbrellaCanopy(umbrella, { ...bounds, top: bounds.top - 2100 }, 13.8);
  assert.equal(initial.top - scrolled.top, 2100);
  assert.equal(umbrella.y, 1800);
  toggleUmbrella(umbrella, 600, 3000, 800, 5000, true);
  assert.equal(umbrella.y, 1800);
  assert.equal(umbrellaCanopy(umbrella, bounds, 13.8), null);
});

test("canopy geometry follows the opening progress and uses measured art rather than viewport coordinates", () => {
  const umbrella = createUmbrella();
  const bounds = { left: 200, right: 310, top: 100 };
  assert.equal(umbrellaCanopy(umbrella, bounds, 14), null);
  toggleUmbrella(umbrella, 255, 133, 800, 600);
  umbrella.progress = 0.5;
  const half = umbrellaCanopy(umbrella, bounds, 14);
  assert.equal(half.right - half.left, 55);
  assert.equal(half.strength, 0.5);
  umbrella.progress = 1;
  const full = umbrellaCanopy(umbrella, bounds, 14);
  assert.equal(full.left, 200);
  assert.equal(full.right, 310);
  assert.equal(umbrellaRoofY(full, 255), full.top);
  assert.equal(umbrellaRoofY(full, 200), full.bottom);
  assert.throws(() => umbrellaCanopy(umbrella, null, 14), TypeError);
});

test("an open umbrella blocks rain underneath, but not outside, above, or far offscreen", () => {
  const rain = createRain(800, 800, () => 0.5);
  const canopy = { left: 250, right: 350, top: 200, bottom: 235, strength: 1 };
  rain.umbrella = canopy;
  assert.equal(underUmbrella(rain, 300, 280), true);
  assert.equal(rainOpacity(rain, 300, 280), 0);
  assert.equal(underUmbrella(rain, 240, 280), false);
  assert.equal(underUmbrella(rain, 300, 190), false);
  assert.ok(rainOpacity(rain, 240, 280) > 0);
  assert.ok(rainOpacity(rain, 300, 190) > 0);
  rain.umbrella = { ...canopy, top: canopy.top - 700, bottom: canopy.bottom - 700 };
  assert.equal(underUmbrella(rain, 300, 100), false);
  assert.ok(rainOpacity(rain, 300, 100) > 0);
  rain.umbrella = canopy;
  assert.equal(rainOpacity(rain, 300, 280), 0);
  rain.umbrella = { ...canopy, strength: 0 };
  assert.ok(rainOpacity(rain, 300, 280) > 0);
});

test("rain catches on the rounded umbrella, beads outward, and drips beyond the edge", () => {
  for (const [x, side] of [[285, -1], [315, 1]]) {
    const rain = createRain(800, 800, () => 0.5);
    rain.umbrella = { left: 250, right: 350, top: 200, bottom: 235, strength: 1 };
    const drop = rain.drops[1];
    Object.assign(drop, { x, y: umbrellaRoofY(rain.umbrella, x) - 1, speed: 300, vy: 300, vx: 0 });
    stepRain(rain, 0.03);
    assert.equal(drop.onRoof, true);
    assert.equal(drop.roofKind, "umbrella");
    assert.equal(drop.roofSide, side);
    for (let i = 0; i < 20 && drop.onRoof; i++) stepRain(rain, 0.03);
    assert.equal(drop.onRoof, false);
    assert.ok(side < 0 ? drop.x < 250 : drop.x > 350);
    assert.ok(drop.y > 235);
    assert.equal(drop.roofKind, null);
  }
});

test("folding an umbrella releases its collected rain and restores the rain field", () => {
  const rain = createRain(800, 800, () => 0.5);
  rain.umbrella = { left: 250, right: 350, top: 200, bottom: 235, strength: 1 };
  const drop = rain.drops[1];
  Object.assign(drop, { x: 290, y: umbrellaRoofY(rain.umbrella, 290) - 1, speed: 300, vy: 300, vx: 0 });
  stepRain(rain, 0.03);
  assert.equal(drop.onRoof, true);
  const before = drop.y;
  rain.umbrella = null;
  stepRain(rain, 0.03);
  assert.equal(drop.onRoof, false);
  assert.equal(drop.roofKind, null);
  assert.ok(drop.y > before);
  assert.ok(rainOpacity(rain, 300, 280) > 0);
});

test("rapid toggles reverse the animation without unbounded state or invalid timing", () => {
  const umbrella = createUmbrella();
  for (let i = 0; i < 500; i++) {
    toggleUmbrella(umbrella, 300, 300, 800, 600);
    stepUmbrella(umbrella, 0.03);
    assert.ok(umbrella.progress >= 0 && umbrella.progress <= 1);
    assert.ok(UMBRELLA_FRAMES.includes(umbrellaArt(umbrella)));
  }
  assert.throws(() => toggleUmbrella(umbrella, NaN, 0, 800, 600), TypeError);
  assert.throws(() => toggleUmbrella(umbrella, 0, 0, 0, 600), TypeError);
  assert.throws(() => stepUmbrella(umbrella, Infinity), TypeError);
});

test("every umbrella frame keeps a straight centered shaft and a connected curved hook", () => {
  for (const art of UMBRELLA_FRAMES) {
    const rows = art.split("\n");
    assert.equal(rows.length, 7);
    assert.ok(rows.every((row) => row.length === UMBRELLA_COLUMNS));
    assert.equal(rows[4][8], "|");
    assert.equal(rows[5][8], "|");
    assert.equal(rows[6].slice(6, 9), "\\_/");
    assert.equal(rows[3][8], "|");
  }
});

test("the graph and house take precedence even when a reflow moves them over the anchored umbrella", () => {
  const umbrella = { left: 100, right: 220, top: 300, bottom: 400 };
  assert.equal(umbrellaOccluded(umbrella, [{ left: 300, right: 800, top: 250, bottom: 700 }]), false);
  assert.equal(umbrellaOccluded(umbrella, [{ left: 80, right: 800, top: 250, bottom: 700 }]), true);
  assert.equal(umbrellaOccluded(umbrella, [{ left: 50, right: 300, top: 390, bottom: 900 }]), true);
  assert.equal(umbrellaOccluded(umbrella, [{ left: 50, right: 300, top: 409, bottom: 900 }]), false);
  assert.equal(umbrellaOccluded(umbrella, []), false);
  assert.throws(() => umbrellaOccluded(null, []), TypeError);
});
