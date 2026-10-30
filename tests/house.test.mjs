import test from "node:test";
import assert from "node:assert/strict";
import { roofArt } from "../public/house.js";
import { createRain, houseRoofY, rainOpacity, stepRain } from "../public/rain.js";

const roof = { left: 200, right: 1000, top: 100, bottom: 240 };
const body = { left: 200, right: 1000, top: 228, bottom: 700 };

test("the ASCII roof fits its character columns and has a ridge and closed eaves", () => {
  for (const columns of [21, 36, 61, 100, 121]) {
    const lines = roofArt(columns).split("\n");
    const width = columns % 2 ? columns : columns - 1;
    assert.equal(lines.length, 10);
    assert.ok(lines.every((line) => line.length === width));
    assert.match(lines[0], /\/.\\/);
    assert.match(lines.at(-1), /^\+={19,119}\+$/);
  }
  assert.throws(() => roofArt(10), RangeError);
  assert.throws(() => roofArt(NaN), RangeError);
  assert.throws(() => roofArt(200), RangeError);
});

test("the physical roof matches a centered peak and symmetric outward slopes", () => {
  assert.equal(houseRoofY(roof, 600), 108);
  assert.equal(houseRoofY(roof, 200), 228);
  assert.equal(houseRoofY(roof, 1000), 228);
  assert.equal(houseRoofY(roof, 400), houseRoofY(roof, 800));
  assert.equal(houseRoofY(roof, 199), null);
  assert.equal(houseRoofY(null, 600), null);
});

test("rain striking a roof becomes a bead, runs outward, then drops outside the wall", () => {
  for (const [x, side] of [[420, -1], [780, 1]]) {
    const rain = createRain(1200, 900, () => 0.5);
    rain.house = { roof, body };
    const drop = rain.drops[1];
    Object.assign(drop, { x, y: houseRoofY(roof, x) - 1, vx: 0, vy: 300, speed: 300 });
    stepRain(rain, 0.03);
    assert.equal(drop.onRoof, true);
    assert.equal(drop.roofSide, side);
    const firstX = drop.x;
    for (let i = 0; i < 10; i++) stepRain(rain, 0.03);
    assert.equal(drop.onRoof, true);
    assert.ok((drop.x - firstX) * side > 50);
    for (let i = 0; i < 45 && drop.onRoof; i++) stepRain(rain, 0.03);
    assert.equal(drop.onRoof, false);
    assert.ok(side < 0 ? drop.x < roof.left : drop.x > roof.right);
    assert.ok(drop.y > roof.bottom - 12);
  }
});

test("the house keeps its interior dry without suppressing rain outside its walls", () => {
  const rain = createRain(1200, 900, () => 0.5);
  rain.house = { roof, body };
  assert.equal(rainOpacity(rain, 600, 400), 0);
  assert.equal(rainOpacity(rain, 600, 600, undefined, undefined, true), 0);
  assert.ok(rainOpacity(rain, 190, 400) > 0);
  assert.ok(rainOpacity(rain, 600, 90) > 0);
  rain.house = null;
  assert.ok(rainOpacity(rain, 600, 400) > 0);
});
