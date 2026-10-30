import test from "node:test";
import assert from "node:assert/strict";
import { MAX_DROPS, MAX_RIPPLES, OUTSIDE_RAIN_VISIBILITY, RAIN_GLYPHS, RAIN_INK, WAKE_RADIUS, addRipple, createRain, moveShelter, overlapsText, rainFlow, rainOpacity, resizeRain, stepRain, underShelter, wakeHalfWidth } from "../public/rain.js";

function seededRandom() {
  let seed = 42;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

test("the shower is at least three times denser on desktop, with beads and streaks", () => {
  const rain = createRain(1440, 950, seededRandom());
  const previousDensity = Math.round(1440 * 950 / 6500);
  assert.ok(rain.drops.length >= previousDensity * 3 && rain.drops.length <= MAX_DROPS);
  assert.ok(rain.drops.filter((drop) => drop.bead).length >= 60);
  assert.ok(rain.drops.filter((drop) => drop.trail).length >= 200);
  assert.ok(rain.drops.every((drop) => RAIN_GLYPHS.includes(drop.glyph)));
  assert.equal(new Set(rain.drops.map((drop) => drop.glyph)).size, 7);
  assert.equal(RAIN_INK, "#344840");
  const count = rain.drops.length;
  for (let i = 0; i < 300; i++) {
    moveShelter(rain, i * 4, 400);
    addRipple(rain, i * 4);
    stepRain(rain, 0.03);
  }
  assert.equal(rain.drops.length, count);
  assert.ok(rain.ripples.length <= MAX_RIPPLES);
});

test("rain falls without a pointer and a long suspended frame cannot teleport it", () => {
  const rain = createRain(1440, 950, seededRandom());
  rain.drops[0].y = 100;
  stepRain(rain, 0.03);
  assert.ok(rain.drops[0].y > 100);
  assert.equal(rain.shelter.strength, 0);
  const previous = rain.drops[0].y;
  stepRain(rain, 1000);
  assert.ok(rain.drops[0].y - previous <= rain.drops[0].speed * 0.051);
});

test("the dry wake has a rounded head and a long, narrowing inverted-teardrop tail", () => {
  const rain = createRain(1200, 800, seededRandom());
  moveShelter(rain, 600, 400);
  for (let i = 0; i < 40; i++) stepRain(rain, 0.03);
  const radius = rain.shelter.radius;
  assert.equal(radius, 42);
  assert.ok(wakeHalfWidth(rain, 400 - radius * 0.4) > wakeHalfWidth(rain, 400 + radius) * 2);
  assert.ok(wakeHalfWidth(rain, 400 + radius * 1.44) > wakeHalfWidth(rain, 400 + radius * 2.02) * 2);
  assert.equal(wakeHalfWidth(rain, 400 - radius * 1.05), 0);
  assert.equal(wakeHalfWidth(rain, 400 + radius * 2.4), 0);
  assert.equal(underShelter(rain, 600, 400), true);
  assert.equal(underShelter(rain, 600, 400 + radius * 1.44), true);
  assert.equal(underShelter(rain, 600 + radius * 0.3, 400 + radius * 1.92), false);
  assert.equal(underShelter(rain, 480, 400), false);
  assert.ok(rainOpacity(rain, 600, 400) < 0.001);
  assert.equal(rainOpacity(rain, 600, 400 - radius * 1.05), 0.82 * 0.75);
});

test("the shelter radius is exactly 42px with the same responsive proportions", () => {
  assert.equal(WAKE_RADIUS, 42);
  const rain = createRain(1440, 950, seededRandom());
  for (const width of [240, 320, 390, 680, 1440, 3840]) {
    const expected = Math.min(26, width * 0.06) * (42 / 26);
    assert.ok(Math.abs(createRain(width, 950, seededRandom()).shelter.radius - expected) < 1e-10);
    resizeRain(rain, width, 950);
    assert.ok(Math.abs(rain.shelter.radius - expected) < 1e-10);
  }
});

test("rain steers strongly outward upstream and curls inward along the tail", () => {
  const rain = createRain(1200, 800, seededRandom());
  moveShelter(rain, 600, 400);
  rain.shelter.strength = 1;
  const drop = { index: 1, speed: 300, phase: 0 };
  const radius = rain.shelter.radius;
  const left = rainFlow(rain, { ...drop, x: 600 - radius * 0.288, y: 400 - radius * 1.442 });
  const right = rainFlow(rain, { ...drop, x: 600 + radius * 0.288, y: 400 - radius * 1.442 });
  assert.ok(left.vx < -100 && right.vx > 100);
  const tailY = 400 + radius * 1.154;
  const width = wakeHalfWidth(rain, tailY);
  const tail = rainFlow(rain, { ...drop, x: 600 + width + radius * 0.23, y: tailY });
  assert.ok(tail.vx < -50 && tail.vy > 150);
  assert.ok(left.vy > 0 && right.vy > 0);
});

test("the velocity field actually curves falling drop trajectories, without an eave teleport", () => {
  const rain = createRain(1200, 1000, seededRandom());
  moveShelter(rain, 600, 400);
  rain.shelter.strength = 1;
  const drop = rain.drops[1];
  const radius = rain.shelter.radius;
  Object.assign(drop, { x: 600 - radius * 0.1923, y: 400 - radius * 2.115, speed: 300, vx: 0, vy: 300 });
  let minX = drop.x;
  let maxOutward = 0;
  for (let i = 0; i < 32; i++) {
    const previousX = drop.x;
    stepRain(rain, 0.03);
    minX = Math.min(minX, drop.x);
    maxOutward = Math.max(maxOutward, -drop.vx);
    assert.ok(Math.abs(drop.x - previousX) < 30);
  }
  assert.ok(minX < 600 - radius * 0.865 && maxOutward > 100);
  assert.ok(drop.y > 450);
});

test("leaving lets the shelter dissolve back into ordinary rain", () => {
  const rain = createRain(1200, 800, seededRandom());
  moveShelter(rain, 600, 400);
  for (let i = 0; i < 40; i++) stepRain(rain, 0.03);
  rain.pointer.active = false;
  for (let i = 0; i < 40; i++) stepRain(rain, 0.03);
  assert.ok(rain.shelter.strength < 0.001);
  assert.ok(rainOpacity(rain, 600, 400) > 0.614);
});

test("the reading column stays quiet but the little window gets visible rain", () => {
  const rain = createRain(1200, 800, seededRandom());
  const reading = { left: 200, right: 1000, top: 0, bottom: 800 };
  const pane = { left: 850, right: 980, top: 200, bottom: 300 };
  assert.equal(rainOpacity(rain, 400, 200, reading, pane), 0.42 * 0.75);
  assert.equal(rainOpacity(rain, 400, 200, reading, pane, true), 0.64 * 0.75);
  assert.equal(rainOpacity(rain, 900, 250, reading, pane), 0.9);
  assert.equal(rainOpacity(rain, 100, 200, reading, pane), 0.82 * 0.75);
  moveShelter(rain, 400, 200);
  rain.shelter.strength = 1;
  assert.equal(rainOpacity(rain, 400, 200, reading, pane, true), 0);
});

test("outside rain is exactly 25 percent fainter while window rain is unchanged", () => {
  const rain = createRain(1200, 800, seededRandom());
  const reading = { left: 200, right: 1000, top: 0, bottom: 800 };
  const pane = { left: 850, right: 980, top: 200, bottom: 300 };
  assert.equal(OUTSIDE_RAIN_VISIBILITY, 0.75);
  for (const [x, y, bending, previous] of [[100, 200, false, 0.82], [400, 200, false, 0.42], [400, 200, true, 0.64]]) {
    assert.equal(rainOpacity(rain, x, y, reading, pane, bending) / previous, 0.75);
  }
  assert.equal(rainOpacity(rain, 900, 250, reading, pane), 0.9);
  assert.equal(rainOpacity(rain, 900, 250, reading, pane, true), 0.9);
});

test("puddle ripples expire and clicking repeatedly cannot grow the scene", () => {
  const rain = createRain(1200, 800, seededRandom());
  for (let i = 0; i < 100; i++) addRipple(rain, 600);
  assert.equal(rain.ripples.length, MAX_RIPPLES);
  rain.drops.length = 0;
  for (let i = 0; i < 70; i++) stepRain(rain, 0.03);
  assert.equal(rain.ripples.length, 0);
});

test("resizing scales the field and adapts density and shelter size to mobile", () => {
  const rain = createRain(1440, 950, seededRandom());
  moveShelter(rain, 1300, 700);
  resizeRain(rain, 320, 568);
  assert.equal(rain.drops.length, 160);
  assert.ok(Math.abs(rain.shelter.radius - Math.min(26, 320 * 0.06) * (42 / 26)) < 1e-10);
  for (let i = 0; i < 300; i++) stepRain(rain, 0.03);
  assert.ok(rain.drops.every((drop) => Number.isFinite(drop.x) && drop.x >= 0 && drop.x <= 320 && drop.y <= rain.groundY));
  resizeRain(rain, 4000, 2000);
  assert.equal(rain.drops.length, MAX_DROPS);
  assert.equal(rain.shelter.radius, 42);
});

test("glyphs stay clear of text with a little breathing room", () => {
  const rectangles = [{ left: 100, right: 200, top: 100, bottom: 120 }];
  assert.equal(overlapsText(150, 110, rectangles), true);
  assert.equal(overlapsText(95, 95, rectangles), true);
  assert.equal(overlapsText(220, 110, rectangles), false);
  assert.equal(overlapsText(150, 145, rectangles), false);
});
