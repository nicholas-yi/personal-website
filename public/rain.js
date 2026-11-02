export const MAX_DROPS = 900;
export const MAX_RIPPLES = 8;
export const GRID_X = 9;
export const GRID_Y = 13;
export const WAKE_RADIUS = 42;
export const OUTSIDE_RAIN_VISIBILITY = 0.75;
export const RAIN_INK = "#344840";
export const RAIN_GLYPHS = Object.freeze(["|", ":", "'", ";", ".", "!", ","]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const dropCount = (width, height) => clamp(Math.round(width * height / 1800), 160, MAX_DROPS);
const radiusForWidth = (width) => WAKE_RADIUS * Math.min(1, width / (26 / 0.06));

function makeDrop(scene, index) {
  const speed = 220 + scene.random() * 200;
  return {
    index,
    x: scene.random() * scene.width,
    y: scene.random() * scene.groundY,
    speed,
    vx: 0,
    vy: speed,
    phase: scene.random() * Math.PI * 2,
    glyph: RAIN_GLYPHS[index % RAIN_GLYPHS.length],
    bead: index % 11 === 0,
    trail: index % 3 !== 2,
    onRoof: false,
    roofSide: 0,
    roofKind: null,
  };
}

export function createRain(width, height, random = Math.random) {
  const scene = {
    width,
    height,
    groundY: Math.max(24, height - 33),
    random,
    time: 0,
    pointer: { x: width / 2, y: height / 2, active: false },
    shelter: { x: width / 2, y: height / 2, radius: radiusForWidth(width), strength: 0 },
    drops: [],
    ripples: [],
    house: null,
    umbrella: null,
  };
  scene.drops = Array.from({ length: dropCount(width, height) }, (_, index) => makeDrop(scene, index));
  return scene;
}

export function resizeRain(scene, width, height) {
  const scaleX = width / Math.max(1, scene.width);
  const scaleY = height / Math.max(1, scene.height);
  scene.width = width;
  scene.height = height;
  scene.groundY = Math.max(24, height - 33);
  for (const drop of scene.drops) {
    drop.x = clamp(drop.x * scaleX, 0, width);
    drop.y = Math.min(drop.y * scaleY, scene.groundY);
    drop.onRoof = false;
    drop.roofKind = null;
  }
  scene.drops.length = Math.min(scene.drops.length, dropCount(width, height));
  while (scene.drops.length < dropCount(width, height)) scene.drops.push(makeDrop(scene, scene.drops.length));
  scene.pointer.x = clamp(scene.pointer.x, 0, width);
  scene.pointer.y = clamp(scene.pointer.y, 0, height);
  scene.shelter.x = clamp(scene.shelter.x, 0, width);
  scene.shelter.y = clamp(scene.shelter.y, 0, height);
  scene.shelter.radius = radiusForWidth(width);
  scene.ripples.length = 0;
}

export function moveShelter(scene, x, y) {
  if (!scene.pointer.active) {
    scene.shelter.x = x;
    scene.shelter.y = y;
  }
  scene.pointer.x = clamp(x, 0, scene.width);
  scene.pointer.y = clamp(y, 0, scene.height);
  scene.pointer.active = true;
}

// A round upstream head and long downstream taper make an inverted teardrop.
export function wakeHalfWidth(scene, y) {
  const { radius, y: centerY } = scene.shelter;
  if (radius <= 0) return 0;
  const relative = (y - centerY) / radius;
  if (relative < -0.95 || relative > 2.35) return 0;
  if (relative <= 0.05) return radius * Math.sqrt(Math.max(0, 1 - (relative - 0.05) ** 2));
  return radius * ((2.35 - relative) / 2.3) ** 1.65;
}

export function underShelter(scene, x, y) {
  return Math.abs(x - scene.shelter.x) < wakeHalfWidth(scene, y);
}

export function rainFlow(scene, drop) {
  const shelter = scene.shelter;
  const wind = Math.sin(scene.time * 0.3 + drop.phase) * 7;
  if (shelter.strength < 0.005 || shelter.radius <= 0) return { vx: wind, vy: drop.speed };
  const relativeY = (drop.y - shelter.y) / shelter.radius;
  if (relativeY < -1.85 || relativeY > 2.65) return { vx: wind, vy: drop.speed };
  const dx = drop.x - shelter.x;
  const side = Math.sign(dx) || (drop.index % 2 ? -1 : 1);
  const distance = Math.abs(dx);
  let vx;
  let vy;
  let weight;

  if (relativeY < -0.8) {
    const approach = clamp((relativeY + 1.85) / 1.05, 0, 1);
    weight = approach * clamp(1 - distance / (shelter.radius * 1.8), 0, 1);
    vx = side * drop.speed * 1.9;
    vy = drop.speed * 0.76;
  } else {
    const halfWidth = wakeHalfWidth(scene, drop.y);
    const slope = clamp(
      (wakeHalfWidth(scene, drop.y + 2) - wakeHalfWidth(scene, drop.y - 2)) / 4,
      -1.5, 2.5,
    );
    const tangent = Math.sqrt(1 + slope * slope);
    const steering = clamp((halfWidth + 10 - distance) * 9, -drop.speed * 0.65, drop.speed * 2);
    weight = clamp(1 - Math.max(0, distance - halfWidth) / (shelter.radius * 0.95), 0, 1);
    weight *= clamp((2.65 - relativeY) / 0.3, 0, 1);
    vx = side * (drop.speed * slope / tangent + steering);
    vy = drop.speed / tangent;
  }
  weight *= shelter.strength;
  return { vx: wind + (vx - wind) * weight, vy: drop.speed + (vy - drop.speed) * weight };
}

export function addRipple(scene, x) {
  if (scene.ripples.length >= MAX_RIPPLES) scene.ripples.shift();
  scene.ripples.push({ x: clamp(x, 8, Math.max(8, scene.width - 8)), age: 0 });
}

export function houseRoofY(roof, x) {
  if (!roof || x < roof.left || x > roof.right || roof.right <= roof.left) return null;
  const center = (roof.left + roof.right) / 2;
  const distance = Math.abs(x - center) / ((roof.right - roof.left) / 2);
  return roof.top + 8 + distance * Math.max(0, roof.bottom - roof.top - 20);
}

export function umbrellaRoofY(roof, x) {
  if (!roof || roof.strength <= 0 || x < roof.left || x > roof.right || roof.right <= roof.left) return null;
  const radius = (roof.right - roof.left) / 2;
  const relative = (x - (roof.left + roof.right) / 2) / radius;
  return roof.bottom - (roof.bottom - roof.top) * Math.sqrt(Math.max(0, 1 - relative * relative));
}

export function underUmbrella(scene, x, y) {
  const roof = scene.umbrella;
  const roofY = umbrellaRoofY(roof, x);
  if (roofY === null || y < roofY || y > roof.bottom + 140) return false;
  const center = (roof.left + roof.right) / 2;
  const halfWidth = (roof.right - roof.left) / 2;
  const narrowing = Math.min(halfWidth * 0.3, Math.max(0, y - roof.bottom) * 0.12);
  return Math.abs(x - center) < halfWidth - narrowing;
}

export function stepRain(scene, elapsed) {
  const dt = clamp(elapsed, 0, 0.05);
  scene.time += dt;
  const shelter = scene.shelter;
  shelter.strength += ((scene.pointer.active ? 1 : 0) - shelter.strength) * (1 - Math.exp(-dt * 9));
  const follow = 1 - Math.exp(-dt * 14);
  shelter.x += (scene.pointer.x - shelter.x) * follow;
  shelter.y += (scene.pointer.y - shelter.y) * follow;

  for (const ripple of scene.ripples) ripple.age += dt;
  scene.ripples = scene.ripples.filter((ripple) => ripple.age < 1.8);

  const bend = 1 - Math.exp(-dt * 13);
  const roofs = [
    scene.house ? { kind: "house", rect: scene.house.roof, height: houseRoofY, eaveOffset: -8 } : null,
    scene.umbrella?.strength > 0 ? { kind: "umbrella", rect: scene.umbrella, height: umbrellaRoofY, eaveOffset: 6 } : null,
  ].filter(Boolean);
  for (const drop of scene.drops) {
    const activeRoof = drop.onRoof ? roofs.find((roof) => roof.kind === (drop.roofKind ?? "house")) : null;
    if (activeRoof) {
      const roof = activeRoof.rect;
      const runoff = 115 + drop.speed * 0.3;
      drop.x += drop.roofSide * runoff * dt;
      const nextY = activeRoof.height(roof, drop.x);
      drop.vx = drop.roofSide * runoff;
      if (nextY !== null) {
        drop.y = nextY - 2;
      } else {
        drop.onRoof = false;
        drop.roofKind = null;
        drop.x = (drop.roofSide < 0 ? roof.left : roof.right) + drop.roofSide * 8;
        drop.y = roof.bottom + activeRoof.eaveOffset;
        drop.vx = drop.roofSide * 20;
        drop.vy = drop.speed;
      }
      continue;
    }
    drop.onRoof = false;
    drop.roofKind = null;
    const previousY = drop.y;
    const flow = rainFlow(scene, drop);
    drop.vx += (flow.vx - drop.vx) * bend;
    drop.vy += (flow.vy - drop.vy) * bend;
    drop.x += drop.vx * dt;
    drop.y += drop.vy * dt;
    if (drop.x < 0) drop.x = scene.width;
    if (drop.x > scene.width) drop.x = 0;
    let collision = null;
    for (const roof of roofs) {
      const y = roof.height(roof.rect, drop.x);
      if (y !== null && previousY < y && drop.y >= y && (!collision || y < collision.y)) collision = { roof, y };
    }
    if (collision) {
      const roof = collision.roof.rect;
      drop.onRoof = true;
      drop.roofKind = collision.roof.kind;
      drop.roofSide = Math.sign(drop.x - (roof.left + roof.right) / 2) || (drop.index % 2 ? -1 : 1);
      drop.y = collision.y - 2;
      continue;
    }
    if (drop.y >= scene.groundY) {
      if (drop.index % 65 === 0) addRipple(scene, drop.x);
      drop.x = scene.random() * scene.width;
      drop.y = -16 - scene.random() * 80;
      drop.vx = 0;
      drop.vy = drop.speed;
    }
  }
}

export function overlapsText(x, y, rectangles) {
  return rectangles.some((rect) => x > rect.left - 7 && x < rect.right + 7 && y > rect.top - 9 && y < rect.bottom + 5);
}

export function indexText(width, height, rectangles) {
  const cell = 64;
  const columns = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const buckets = Array.from({ length: columns * rows }, () => []);
  for (const rect of rectangles) {
    const area = { left: rect.left - 7, right: rect.right + 7, top: rect.top - 9, bottom: rect.bottom + 5 };
    if (area.right < 0 || area.left > width || area.bottom < 0 || area.top > height) continue;
    for (let row = Math.max(0, Math.floor(area.top / cell)); row <= Math.min(rows - 1, Math.floor(area.bottom / cell)); row++) {
      for (let column = Math.max(0, Math.floor(area.left / cell)); column <= Math.min(columns - 1, Math.floor(area.right / cell)); column++) {
        buckets[row * columns + column].push(area);
      }
    }
  }
  return { cell, columns, rows, buckets };
}

export function overlapsIndexedText(index, x, y) {
  const column = Math.floor(x / index.cell);
  const row = Math.floor(y / index.cell);
  if (column < 0 || column >= index.columns || row < 0 || row >= index.rows) return false;
  return index.buckets[row * index.columns + column].some((rect) => x > rect.left && x < rect.right && y > rect.top && y < rect.bottom);
}

export function rainOpacity(scene, x, y, readingArea, windowPane, bending = false) {
  const inside = (rect) => rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  if (inside(scene.house?.body)) return 0;
  const paperOpacity = bending ? 0.64 : 0.42;
  const opacity = inside(windowPane) ? 0.9 : (inside(readingArea) ? paperOpacity : 0.82) * OUTSIDE_RAIN_VISIBILITY;
  const umbrellaShade = underUmbrella(scene, x, y) ? 1 - scene.umbrella.strength : 1;
  return opacity * umbrellaShade * (underShelter(scene, x, y) ? 1 - scene.shelter.strength : 1);
}
