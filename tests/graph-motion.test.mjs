import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_NODE_OFFSET, MAX_TRAIL_POINTS, TRAIL_OPACITY,
  aimTrail, createSpring, createTrail, kickSpring, repulsionTarget, stepSpring, stepTrail,
} from "../public/graph-motion.js";

test("node impulses jiggle, remain within six pixels, and settle exactly", () => {
  const spring = createSpring();
  kickSpring(spring, 120, -100);
  let maximum = 0;
  let reversed = false;
  let active;
  for (let i = 0; i < 240; i++) {
    active = stepSpring(spring, { x: 0, y: 0 }, 1 / 60);
    maximum = Math.max(maximum, Math.hypot(spring.x, spring.y));
    if (spring.x < -0.02) reversed = true;
    assert.ok(Math.hypot(spring.x, spring.y) <= MAX_NODE_OFFSET + 1e-8);
    assert.ok([spring.x, spring.y, spring.vx, spring.vy].every(Number.isFinite));
  }
  assert.ok(maximum > 1);
  assert.equal(reversed, true);
  assert.equal(active, false);
  assert.deepEqual(spring, createSpring());
});

test("proximity only nudges nearby nodes and a centered pointer remains well-defined", () => {
  const anchor = { x: 100, y: 100 };
  assert.deepEqual(repulsionTarget(anchor, { x: 100, y: 100, active: false }), { x: 0, y: 0 });
  assert.deepEqual(repulsionTarget(anchor, { x: 300, y: 100, active: true }), { x: 0, y: 0 });
  const near = repulsionTarget(anchor, { x: 110, y: 100, active: true });
  assert.ok(near.x < 0 && Math.hypot(near.x, near.y) < MAX_NODE_OFFSET);
  const centered = repulsionTarget(anchor, { ...anchor, active: true });
  assert.ok(Number.isFinite(centered.x) && Number.isFinite(centered.y));
  assert.ok(Math.hypot(centered.x, centered.y) <= 4.2);
});

test("slow frames stay stable and a stationary hover does not animate forever", () => {
  const spring = createSpring();
  kickSpring(spring, 250, 200);
  let active;
  for (let i = 0; i < 200; i++) {
    active = stepSpring(spring, { x: 3, y: 1 }, 5);
    assert.ok(Math.hypot(spring.x, spring.y) <= MAX_NODE_OFFSET + 1e-8);
  }
  assert.equal(active, false);
  assert.deepEqual(spring, { x: 3, y: 1, vx: 0, vy: 0 });
});

test("invalid spring state and unreachable targets fail explicitly", () => {
  assert.throws(() => kickSpring(createSpring(), NaN, 0), TypeError);
  assert.throws(() => stepSpring(createSpring(), { x: 0, y: 0 }, NaN), TypeError);
  assert.throws(() => stepSpring(createSpring(), { x: 100, y: 0 }, 0.016), RangeError);
});

test("the phantom pencil follows behind the pointer rather than replacing it", () => {
  const trail = createTrail();
  aimTrail(trail, 10, 10);
  aimTrail(trail, 90, 40);
  assert.equal(stepTrail(trail, 1 / 60), true);
  assert.ok(trail.x > 10 && trail.x < 90);
  assert.ok(trail.y > 10 && trail.y < 40);
  assert.ok(trail.opacity > 0 && trail.opacity <= TRAIL_OPACITY);
  assert.ok(trail.points.length > 1);
});

test("the laser guide has exactly twice the previous opacity without changing its bounded lifetime", () => {
  assert.equal(TRAIL_OPACITY, 0.24 * 2);
  const trail = createTrail();
  for (let i = 0; i < 120; i++) {
    aimTrail(trail, i * 2, 30);
    stepTrail(trail, 1 / 60);
    assert.ok(trail.opacity <= TRAIL_OPACITY);
  }
  assert.ok(trail.opacity > 0.479);
  for (let i = 0; i < 120; i++) stepTrail(trail, 1 / 60);
  assert.equal(trail.opacity, 0);
  assert.deepEqual(trail.points, []);
});

test("pointer traces are bounded in length, history, and lifetime", () => {
  const trail = createTrail();
  for (let i = 0; i < 300; i++) {
    aimTrail(trail, i * 5, Math.sin(i * 0.2) * 20);
    stepTrail(trail, 1 / 60);
    assert.ok(trail.points.length <= MAX_TRAIL_POINTS);
    assert.ok(trail.points.every((point) => point.age < 0.3 && Math.hypot(trail.x - point.x, trail.y - point.y) <= 96));
  }
  trail.active = false;
  let active;
  for (let i = 0; i < 120; i++) active = stepTrail(trail, 1 / 60);
  assert.equal(active, false);
  assert.equal(trail.opacity, 0);
  assert.equal(trail.points.length, 0);
});

test("large pointer jumps do not draw a false line across the paper", () => {
  const trail = createTrail();
  aimTrail(trail, 10, 10);
  aimTrail(trail, 900, 600);
  assert.equal(trail.x, 900);
  assert.equal(trail.y, 600);
  assert.deepEqual(trail.points, [{ x: 900, y: 600, age: 0 }]);
});

test("a stationary pointer also fades the trail and stops scheduling work", () => {
  const trail = createTrail();
  aimTrail(trail, 10, 10);
  aimTrail(trail, 70, 50);
  let active;
  for (let i = 0; i < 120; i++) active = stepTrail(trail, 1 / 60);
  assert.equal(active, false);
  assert.equal(trail.opacity, 0);
  assert.deepEqual(trail.points, []);
  assert.throws(() => aimTrail(trail, Infinity, 0), TypeError);
  assert.throws(() => stepTrail(trail, NaN), TypeError);
});
