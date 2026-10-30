export const MAX_NODE_OFFSET = 6;
export const MAX_TRAIL_POINTS = 16;
export const TRAIL_OPACITY = 0.48;
const MAX_TRAIL_LENGTH = 96;

export function createSpring() {
  return { x: 0, y: 0, vx: 0, vy: 0 };
}

export function kickSpring(spring, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError("A spring impulse must be finite.");
  spring.vx += x;
  spring.vy += y;
}

export function repulsionTarget(anchor, pointer, phase = 0) {
  if (!pointer?.active) return { x: 0, y: 0 };
  const dx = anchor.x - pointer.x;
  const dy = anchor.y - pointer.y;
  const distance = Math.hypot(dx, dy);
  const force = Math.max(0, 1 - distance / 90) ** 2 * 4.2;
  if (force === 0) return { x: 0, y: 0 };
  return {
    x: (distance > 0.1 ? dx / distance : Math.cos(phase)) * force,
    y: (distance > 0.1 ? dy / distance : Math.sin(phase)) * force,
  };
}

export function stepSpring(spring, target, elapsed) {
  if (![elapsed, target.x, target.y, spring.x, spring.y, spring.vx, spring.vy].every(Number.isFinite)) {
    throw new TypeError("Spring state and timing must be finite.");
  }
  if (Math.hypot(target.x, target.y) > MAX_NODE_OFFSET) throw new RangeError("A spring target must stay inside its motion bound.");
  const dt = Math.max(0, Math.min(0.05, elapsed));
  const count = Math.max(1, Math.ceil(dt * 120));
  const step = dt / count;
  // Small integration steps keep a delayed browser frame from exploding the spring.
  for (let i = 0; i < count; i++) {
    spring.vx += ((target.x - spring.x) * 190 - spring.vx * 15.8) * step;
    spring.vy += ((target.y - spring.y) * 190 - spring.vy * 15.8) * step;
    spring.x += spring.vx * step;
    spring.y += spring.vy * step;
    const length = Math.hypot(spring.x, spring.y);
    if (length > MAX_NODE_OFFSET) {
      const nx = spring.x / length;
      const ny = spring.y / length;
      spring.x = nx * MAX_NODE_OFFSET;
      spring.y = ny * MAX_NODE_OFFSET;
      const outward = spring.vx * nx + spring.vy * ny;
      if (outward > 0) {
        spring.vx -= 1.35 * outward * nx;
        spring.vy -= 1.35 * outward * ny;
      }
    }
  }
  if (Math.hypot(spring.x - target.x, spring.y - target.y) < 0.02 && Math.hypot(spring.vx, spring.vy) < 0.08) {
    spring.x = target.x;
    spring.y = target.y;
    spring.vx = 0;
    spring.vy = 0;
    return false;
  }
  return true;
}

export function createTrail() {
  return { x: 0, y: 0, targetX: 0, targetY: 0, active: false, initialized: false, idle: 0, opacity: 0, points: [] };
}

export function aimTrail(trail, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError("A pointer position must be finite.");
  if (!trail.initialized || Math.hypot(x - trail.x, y - trail.y) > 160) {
    trail.x = x;
    trail.y = y;
    trail.points = [{ x, y, age: 0 }];
  }
  trail.initialized = true;
  trail.active = true;
  trail.idle = 0;
  trail.targetX = x;
  trail.targetY = y;
}

export function stepTrail(trail, elapsed) {
  if (!Number.isFinite(elapsed)) throw new TypeError("Trail timing must be finite.");
  const dt = Math.max(0, Math.min(0.05, elapsed));
  trail.idle += dt;
  const previousX = trail.x;
  const previousY = trail.y;
  const follow = 1 - Math.exp(-dt * 12);
  trail.x += (trail.targetX - trail.x) * follow;
  trail.y += (trail.targetY - trail.y) * follow;
  const targetOpacity = trail.active && trail.idle < 0.14 ? TRAIL_OPACITY : 0;
  trail.opacity += (targetOpacity - trail.opacity) * (1 - Math.exp(-dt * 11));
  for (const point of trail.points) point.age += dt;
  trail.points = trail.points.filter((point) => point.age < 0.3 && Math.hypot(trail.x - point.x, trail.y - point.y) <= MAX_TRAIL_LENGTH);
  if (trail.opacity > 0.005 && Math.hypot(trail.x - previousX, trail.y - previousY) > 0.3) {
    trail.points.push({ x: trail.x, y: trail.y, age: 0 });
  }
  if (trail.points.length > MAX_TRAIL_POINTS) trail.points.splice(0, trail.points.length - MAX_TRAIL_POINTS);
  if (trail.opacity < 0.005 && (!trail.active || trail.idle > 0.6)) {
    trail.opacity = 0;
    trail.points = [];
    return false;
  }
  return trail.opacity > 0 || trail.points.length > 0;
}
