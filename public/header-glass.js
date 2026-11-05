export const GLASS_MARK_LIFETIME = 8800;
export const GLASS_FOG_DELAY = 200;
const MASK_SCALE = 0.5;
const FRAME_INTERVAL = 1000 / 30;
const FOG_STEP = 25;
const FOG_CURVE = Float32Array.from({ length: GLASS_MARK_LIFETIME / FOG_STEP + 1 }, (_, index) => {
  const remaining = Math.max(0, Math.min(1, 1 - (index * FOG_STEP - GLASS_FOG_DELAY) / (GLASS_MARK_LIFETIME - GLASS_FOG_DELAY)));
  return remaining * remaining * (3 - 2 * remaining);
});

function remainingClarity(age) {
  if (age <= GLASS_FOG_DELAY) return 1;
  if (age >= GLASS_MARK_LIFETIME) return 0;
  return FOG_CURVE[(age / FOG_STEP) | 0];
}

export function glassMarkStrength(mark, now) {
  if (!Number.isFinite(mark?.time) || !Number.isFinite(now)) {
    throw new TypeError("Condensation marks need finite timestamps.");
  }
  return remainingClarity(now - mark.time);
}

export function createGlassField(width, height, radius) {
  if (![width, height, radius].every(value => Number.isFinite(value) && value > 0)) {
    throw new TypeError("A condensation field needs positive finite dimensions and brush radius.");
  }
  const columns = Math.ceil(width * MASK_SCALE);
  const rows = Math.ceil(height * MASK_SCALE);
  const brushRadius = radius * MASK_SCALE;
  const kernel = [];
  for (let y = -Math.ceil(brushRadius); y <= brushRadius; y++) {
    for (let x = -Math.ceil(brushRadius); x <= brushRadius; x++) {
      const feather = Math.max(0, Math.min(1, (1 - Math.hypot(x, y) / brushRadius) / 0.45));
      if (feather > 0) kernel.push({ x, y, clarity: 0.97 * feather * feather * (3 - 2 * feather) });
    }
  }
  return {
    width: columns, height: rows, cssWidth: width, cssHeight: height, radius: brushRadius,
    clarity: new Float32Array(columns * rows), time: new Float64Array(columns * rows),
    cells: new Uint32Array(columns * rows),
    kernel, active: 0,
  };
}

export function paintGlassSegment(field, from, to, now) {
  if (![from?.x, from?.y, to?.x, to?.y, now, from?.time ?? now].every(Number.isFinite)) {
    throw new TypeError("A glass wipe needs finite coordinates and timestamps.");
  }
  for (const point of [from, to]) {
    if (point.x < 0 || point.x > field.cssWidth || point.y < 0 || point.y > field.cssHeight) {
      throw new RangeError("The glass wipe must stay inside the header.");
    }
  }
  const x = from.x * MASK_SCALE;
  const y = from.y * MASK_SCALE;
  const dx = (to.x - from.x) * MASK_SCALE;
  const dy = (to.y - from.y) * MASK_SCALE;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.01) return false;
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, field.radius * 0.3)));
  const started = from.time ?? now;
  for (let step = 0; step <= steps; step++) {
    const centerX = Math.round(x + dx * step / steps);
    const centerY = Math.round(y + dy * step / steps);
    const touched = started + (now - started) * step / steps;
    for (const cell of field.kernel) {
      const px = centerX + cell.x;
      const py = centerY + cell.y;
      if (px < 0 || px >= field.width || py < 0 || py >= field.height) continue;
      const index = py * field.width + px;
      const previous = field.clarity[index];
      if (previous > 0 && field.time[index] > touched) continue;
      const retained = previous * remainingClarity(touched - field.time[index]);
      field.clarity[index] = Math.max(retained, cell.clarity);
      field.time[index] = touched;
      if (previous === 0) field.cells[field.active++] = index;
    }
  }
  return true;
}

export function writeGlassMask(field, pixels, now) {
  if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== field.width * field.height * 4 || !Number.isFinite(now)) {
    throw new TypeError("The condensation mask needs matching pixel storage and a finite timestamp.");
  }
  let retained = 0;
  for (let cell = 0; cell < field.active; cell++) {
    const index = field.cells[cell];
    const strength = field.clarity[index];
    const remaining = remainingClarity(now - field.time[index]);
    pixels[index * 4 + 3] = strength * remaining * 255;
    if (remaining === 0) field.clarity[index] = 0;
    else field.cells[retained++] = index;
  }
  field.active = retained;
  return field.active > 0;
}

export function installHeaderGlass(doc) {
  const header = doc.querySelector(".site-header");
  if (!header) return;
  const view = doc.defaultView;
  const forced = view.matchMedia("(forced-colors: active)");
  const canvas = doc.createElement("canvas");
  const texture = doc.createElement("canvas");
  const mask = doc.createElement("canvas");
  const context = canvas.getContext("2d");
  const frost = texture.getContext("2d");
  const maskContext = mask.getContext("2d");
  if (!context || !frost || !maskContext) {
    console.warn("Header condensation needs canvas support; the static banner is unchanged.");
    return;
  }
  canvas.className = "header-glass";
  canvas.setAttribute("aria-hidden", "true");
  let field;
  let pixels;
  let lastPoint = null;
  let inputBounds = null;
  let frame = 0;
  let nextFrame = 0;
  let expiresAt = 0;
  let width = 0;
  let height = 0;
  let scale = 1;
  const active = () => !doc.hidden && !forced.matches;

  function draw(now) {
    context.clearRect(0, 0, width, height);
    context.drawImage(texture, 0, 0, width, height);
    if (!field?.active) return;
    writeGlassMask(field, pixels.data, now);
    maskContext.putImageData(pixels, 0, 0);
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.drawImage(mask, 0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    context.restore();
  }

  function animate(now) {
    frame = 0;
    if (!active()) return;
    if (now >= nextFrame || now >= expiresAt) {
      draw(now);
      nextFrame = now + FRAME_INTERVAL;
    }
    if (field.active) frame = view.requestAnimationFrame(animate);
    else nextFrame = 0;
  }

  function clear() {
    view.cancelAnimationFrame(frame);
    frame = 0;
    nextFrame = 0;
    expiresAt = 0;
    if (field) {
      field.clarity.fill(0);
      field.time.fill(0);
      field.active = 0;
      pixels.data.fill(0);
    }
    lastPoint = null;
    if (!doc.hidden) draw(view.performance.now());
  }

  function resize(force = false) {
    const bounds = header.getBoundingClientRect();
    const density = Math.min(view.devicePixelRatio || 1, 1.5);
    if (force !== true && width === bounds.width && height === bounds.height && scale === density) return;
    const geometryChanged = width !== bounds.width || height !== bounds.height;
    width = bounds.width;
    height = bounds.height;
    scale = density;
    if (!width || !height) return;
    inputBounds = bounds;
    for (const layer of [canvas, texture]) {
      layer.width = Math.ceil(width * scale);
      layer.height = Math.ceil(height * scale);
    }
    context.setTransform(scale, 0, 0, scale, 0, 0);
    frost.setTransform(scale, 0, 0, scale, 0, 0);
    if (geometryChanged) {
      field = createGlassField(width, height, Math.max(32, height * 0.56) * 1.5 / 2);
      mask.width = field.width;
      mask.height = field.height;
      pixels = maskContext.createImageData(field.width, field.height);
    }
    frost.clearRect(0, 0, width, height);
    const palette = view.getComputedStyle(doc.documentElement);
    const fog = palette.getPropertyValue("--glass-fog-rgb").trim();
    const light = palette.getPropertyValue("--glass-light-rgb").trim();
    const dew = palette.getPropertyValue("--glass-dew-rgb").trim();
    frost.fillStyle = `rgba(${fog}, ${(0.925 - 0.12) / (1 - 0.12)})`;
    frost.fillRect(0, 0, width, height);
    const cloud = frost.createRadialGradient(width * 0.6, -height, height * 0.3, width * 0.6, 0, width * 0.72);
    cloud.addColorStop(0, `rgba(${light}, 0.25)`);
    cloud.addColorStop(1, "transparent");
    frost.fillStyle = cloud;
    frost.fillRect(0, 0, width, height);
    for (let index = 0; index < Math.ceil(width / 12); index++) {
      const x = ((index * 73.37 + 11) % width);
      const y = ((index * 31.13 + 19) % height);
      const radius = 0.65 + index % 4 * 0.35;
      frost.fillStyle = `rgba(${dew}, 0.13)`;
      frost.beginPath();
      frost.ellipse(x, y, radius, radius * 1.35, 0, 0, Math.PI * 2);
      frost.fill();
      frost.fillStyle = `rgba(${light}, 0.65)`;
      frost.beginPath();
      frost.arc(x - radius * 0.25, y - radius * 0.35, Math.max(0.35, radius * 0.35), 0, Math.PI * 2);
      frost.fill();
    }
    if (geometryChanged) clear();
    else draw(view.performance.now());
  }

  function mark(event) {
    if (!active()) return;
    const coalesced = event.getCoalescedEvents?.();
    const samples = coalesced?.length ? coalesced : [event];
    const time = view.performance.now();
    inputBounds ??= header.getBoundingClientRect();
    for (const sample of samples) {
      const point = { x: sample.clientX - inputBounds.left, y: sample.clientY - inputBounds.top, time };
      if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) { lastPoint = null; continue; }
      if (lastPoint && paintGlassSegment(field, lastPoint, point, time)) {
        expiresAt = time + GLASS_MARK_LIFETIME;
      }
      lastPoint = point;
    }
    if (field.active && !frame) frame = view.requestAnimationFrame(animate);
  }

  header.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    mark(event);
  }, { passive: true });
  header.addEventListener("pointerleave", () => { lastPoint = null; inputBounds = null; });
  header.addEventListener("pointercancel", clear);
  view.addEventListener("blur", clear);
  view.addEventListener("resize", resize);
  view.addEventListener("scroll", () => { lastPoint = null; inputBounds = null; }, { passive: true });
  view.addEventListener("themechange", () => resize(true));
  doc.addEventListener("visibilitychange", clear);
  forced.addEventListener("change", clear);
  new view.ResizeObserver(resize).observe(header);
  header.prepend(canvas);
  resize();
  header.dataset.glass = "ready";
}
