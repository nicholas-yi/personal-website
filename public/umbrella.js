export const UMBRELLA_COLUMNS = 17;
const handle = ["        |", "        |", "      \\_/"];
const frame = (canopy) => [...canopy, ...handle].map((line) => line.padEnd(UMBRELLA_COLUMNS)).join("\n");
// Keep the shaft at column eight in every frame; centering rows separately bends the handle.
export const UMBRELLA_FRAMES = Object.freeze([
  frame(["        ^", "       /|\\", "       |||", "        |"]),
  frame(["        ^", "      / | \\", "      \\ | /", "        |"]),
  frame(["      .-^-.", "     / /|\\ \\", "     '  |  '", "        |"]),
  frame(["     .--^--.", "    / / | \\ \\", "   '--._|_.--'", "        |"]),
  frame(["    .---^---.", "  .' /  |  \\ '.", " /__/___|___\\__\\", " '  '   |   '  '"]),
]);

export function createUmbrella() {
  return { x: 0, y: 0, progress: 0, open: false, placed: false };
}

function positionUmbrella(umbrella, x, y, width, height) {
  const padX = Math.min(66, width / 2);
  const padY = Math.min(65, height / 2);
  umbrella.x = Math.min(width - padX, Math.max(padX, x));
  umbrella.y = Math.min(height - padY, Math.max(padY, y));
}

export function toggleUmbrella(umbrella, x, y, width, height, still = false) {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new TypeError("An umbrella needs a finite pointer position and positive viewport dimensions.");
  }
  if (!umbrella.open) {
    positionUmbrella(umbrella, x, y, width, height);
    umbrella.placed = true;
  }
  umbrella.open = !umbrella.open;
  if (still) umbrella.progress = Number(umbrella.open);
}

export function stepUmbrella(umbrella, elapsed) {
  if (!Number.isFinite(elapsed)) throw new TypeError("Umbrella timing must be finite.");
  const target = Number(umbrella.open);
  const distance = target - umbrella.progress;
  umbrella.progress += Math.sign(distance) * Math.min(Math.abs(distance), Math.max(0, Math.min(0.05, elapsed)) * 4.5);
  return umbrella.progress !== target;
}

export function umbrellaArt(umbrella) {
  return UMBRELLA_FRAMES[Math.min(UMBRELLA_FRAMES.length - 1, Math.floor(umbrella.progress * UMBRELLA_FRAMES.length))];
}

export function umbrellaCanopy(umbrella, bounds, lineHeight) {
  if (!umbrella.placed || umbrella.progress <= 0) return null;
  if (!bounds || ![bounds.left, bounds.right, bounds.top, lineHeight].every(Number.isFinite) || lineHeight <= 0 || bounds.right <= bounds.left) {
    throw new TypeError("The canopy needs measured bounds and a positive line height.");
  }
  const center = (bounds.left + bounds.right) / 2;
  const radius = (bounds.right - bounds.left) / 2 * umbrella.progress;
  return {
    left: center - radius,
    right: center + radius,
    top: bounds.top + lineHeight * 0.35,
    bottom: bounds.top + lineHeight * 2.7,
    strength: umbrella.progress,
  };
}

export function umbrellaOccluded(bounds, foregrounds) {
  const coordinates = (rect) => rect && [rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite);
  if (!coordinates(bounds) || !Array.isArray(foregrounds) || !foregrounds.every(coordinates)) {
    throw new TypeError("Umbrella occlusion needs finite bounds and foreground rectangles.");
  }
  return foregrounds.some((rect) =>
    bounds.left - 8 < rect.right && bounds.right + 8 > rect.left &&
    bounds.top - 8 < rect.bottom && bounds.bottom + 8 > rect.top);
}

export function installUmbrella(doc, { onChange = () => {}, onToggle = () => {} } = {}) {
  const view = doc.defaultView;
  const reducedMotion = view.matchMedia("(prefers-reduced-motion: reduce)");
  const umbrella = createUmbrella();
  const art = doc.createElement("pre");
  art.className = "click-umbrella";
  art.setAttribute("aria-hidden", "true");
  art.hidden = true;
  const rows = Math.max(...UMBRELLA_FRAMES.map((frame) => frame.split("\n").length));
  art.style.width = `${UMBRELLA_COLUMNS}ch`;
  art.style.height = `${rows * 1.15}em`;
  doc.body.append(art);
  let pressed = null;
  let frame = 0;
  let lastTime = 0;

  function render() {
    art.hidden = !umbrella.placed;
    art.textContent = umbrellaArt(umbrella);
    art.style.left = `${umbrella.x}px`;
    art.style.top = `${umbrella.y}px`;
    art.dataset.state = umbrella.open ? "open" : "closed";
    art.dataset.progress = umbrella.progress.toFixed(2);
    const foregrounds = [...doc.querySelectorAll(".play-section, .about-section")].map((element) => element.getBoundingClientRect());
    const occluded = umbrella.placed && umbrellaOccluded(art.getBoundingClientRect(), foregrounds);
    art.dataset.occluded = String(occluded);
    art.hidden = !umbrella.placed || occluded;
    onChange();
  }
  function animate(now) {
    const moving = stepUmbrella(umbrella, lastTime ? (now - lastTime) / 1000 : 1 / 60);
    lastTime = now;
    render();
    frame = moving ? view.requestAnimationFrame(animate) : 0;
  }
  function settle() {
    view.cancelAnimationFrame(frame);
    frame = 0;
    pressed = null;
    umbrella.progress = Number(umbrella.open);
    render();
  }
  function excluded(target) {
    return target.closest?.("a, button, input, textarea, select, [contenteditable], [data-graph-playground], .play-section, .about-section, .site-header");
  }
  doc.addEventListener("pointerdown", (event) => {
    pressed = event.button === 0 && event.isPrimary !== false && !excluded(event.target)
      ? { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false } : null;
  }, true);
  doc.addEventListener("pointermove", (event) => {
    if (pressed?.id === event.pointerId && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 6) pressed.moved = true;
  }, true);
  doc.addEventListener("pointercancel", () => { pressed = null; }, true);
  doc.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button > 0 || event.detail === 0 || excluded(event.target) || pressed?.moved) return;
    if (!doc.getSelection()?.isCollapsed) return;
    pressed = null;
    toggleUmbrella(
      umbrella, event.clientX + view.scrollX, event.clientY + view.scrollY,
      doc.documentElement.clientWidth, Math.max(doc.documentElement.scrollHeight, view.innerHeight),
      reducedMotion.matches,
    );
    view.cancelAnimationFrame(frame);
    lastTime = 0;
    render();
    onToggle(umbrella.open);
    if (!reducedMotion.matches) frame = view.requestAnimationFrame(animate);
  });
  reducedMotion.addEventListener("change", settle);
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) settle(); });
  view.addEventListener("blur", settle);
  view.addEventListener("resize", () => {
    positionUmbrella(umbrella, umbrella.x, umbrella.y, doc.documentElement.clientWidth, Math.max(doc.documentElement.scrollHeight, view.innerHeight));
    settle();
  });
  view.addEventListener("scroll", render, { passive: true });
  new view.ResizeObserver(render).observe(doc.querySelector(".page"));
  return {
    canopy() {
      if (!umbrella.placed || umbrella.progress <= 0 || art.hidden) return null;
      return umbrellaCanopy(umbrella, art.getBoundingClientRect(), Number.parseFloat(view.getComputedStyle(art).lineHeight));
    },
  };
}
