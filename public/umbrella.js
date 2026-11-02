export const UMBRELLA_COLUMNS = 17;
export const UMBRELLA_REPLACE_DISTANCE = 120;
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

function checkPosition(x, y, width, height) {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new TypeError("An umbrella needs a finite pointer position and positive viewport dimensions.");
  }
}

export function moveUmbrella(umbrella, x, y, width, height) {
  checkPosition(x, y, width, height);
  positionUmbrella(umbrella, x, y, width, height);
}

export function activateUmbrella(umbrella, x, y, width, height, still = false) {
  checkPosition(x, y, width, height);
  if (!umbrella.placed || Math.hypot(x - umbrella.x, y - umbrella.y) > UMBRELLA_REPLACE_DISTANCE) {
    positionUmbrella(umbrella, x, y, width, height);
    umbrella.placed = true;
    umbrella.open = true;
    umbrella.progress = still ? 1 : 0;
  } else {
    umbrella.open = !umbrella.open;
    if (still) umbrella.progress = Number(umbrella.open);
  }
}

export function toggleUmbrella(umbrella, x, y, width, height, still = false) {
  checkPosition(x, y, width, height);
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
  const finePointer = view.matchMedia("(hover: hover) and (pointer: fine)");
  const umbrella = createUmbrella();
  const art = doc.createElement("button");
  art.type = "button";
  art.className = "click-umbrella";
  art.hidden = true;
  const rows = Math.max(...UMBRELLA_FRAMES.map((frame) => frame.split("\n").length));
  art.style.width = `${UMBRELLA_COLUMNS}ch`;
  art.style.height = `${rows * 1.15}em`;
  doc.body.append(art);
  let pressed = null;
  let frame = 0;
  let lastTime = 0;
  let suppressClick = false;
  function dimensions() {
    return { width: doc.documentElement.clientWidth, height: Math.max(doc.documentElement.scrollHeight, view.innerHeight) };
  }
  function foregrounds() {
    return [...doc.querySelectorAll(".play-section, .house-shelter, .site-header, .site-footer")].map((element) => element.getBoundingClientRect());
  }

  function render() {
    art.hidden = !umbrella.placed;
    art.textContent = umbrellaArt(umbrella);
    art.style.left = `${umbrella.x}px`;
    art.style.top = `${umbrella.y}px`;
    art.dataset.state = umbrella.open ? "open" : "closed";
    if (doc.documentElement.hasAttribute("data-umbrella-cursor")) {
      doc.documentElement.dataset.umbrellaCursor = art.dataset.state;
    }
    art.dataset.progress = umbrella.progress.toFixed(2);
    art.setAttribute("aria-label", `${umbrella.open ? "Open" : "Folded"} umbrella. Click to ${umbrella.open ? "fold" : "open"}; drag or use arrow keys to move.`);
    art.title = "Drag to move; click to fold/open. Arrow keys move; Shift moves farther.";
    const occluded = umbrella.placed && umbrellaOccluded(art.getBoundingClientRect(), foregrounds());
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
    endPress();
    clearCursor();
    umbrella.progress = Number(umbrella.open);
    render();
  }
  function excluded(target) {
    if (target === art) return false;
    return !target?.closest || target.closest("a, button, input, textarea, select, summary, label, [role='button'], [role='link'], [contenteditable], [data-graph-playground], .play-section, .house-shelter, .site-header, .site-footer, .garden-note, .work-art, .hearth, p, li, dt, dd, h1, h2, h3, h4, pre, .eyebrow, figure, .window-caption");
  }
  function clearCursor() {
    delete doc.documentElement.dataset.umbrellaCursor;
  }
  function updateCursor(event) {
    if (!finePointer.matches || event.pointerType === "touch" || event.target === art || excluded(event.target)) {
      clearCursor();
      return;
    }
    const state = umbrella.open ? "open" : "closed";
    if (doc.documentElement.dataset.umbrellaCursor !== state) doc.documentElement.dataset.umbrellaCursor = state;
  }
  doc.addEventListener("pointerover", updateCursor, true);
  doc.addEventListener("pointerout", (event) => { if (!event.relatedTarget) clearCursor(); }, true);
  doc.addEventListener("pointerdown", (event) => {
    suppressClick = false;
    updateCursor(event);
    pressed = event.button === 0 && event.isPrimary !== false && !excluded(event.target)
      ? { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false, dragging: event.target === art, anchorX: umbrella.x, anchorY: umbrella.y, scrollX: view.scrollX, scrollY: view.scrollY } : null;
    if (pressed?.dragging) {
      art.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  }, true);
  doc.addEventListener("pointermove", (event) => {
    updateCursor(event);
    if (pressed?.id === event.pointerId && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > 6) pressed.moved = true;
    if (pressed?.id === event.pointerId && pressed.dragging && pressed.moved) {
      event.preventDefault();
      art.dataset.dragging = "true";
      moveTo(pressed.anchorX + event.clientX - pressed.x + view.scrollX - pressed.scrollX, pressed.anchorY + event.clientY - pressed.y + view.scrollY - pressed.scrollY);
    }
  }, true);
  function endPress() {
    const active = pressed;
    pressed = null;
    if (active?.moved) suppressClick = true;
    if (active?.dragging && art.hasPointerCapture(active.id)) art.releasePointerCapture(active.id);
    delete art.dataset.dragging;
  }
  function moveTo(x, y) {
    const before = { x: umbrella.x, y: umbrella.y };
    const size = dimensions();
    moveUmbrella(umbrella, x, y, size.width, size.height);
    const bounds = art.getBoundingClientRect();
    const dx = umbrella.x - before.x;
    const dy = umbrella.y - before.y;
    if (umbrellaOccluded({ left: bounds.left + dx, right: bounds.right + dx, top: bounds.top + dy, bottom: bounds.bottom + dy }, foregrounds())) {
      umbrella.x = before.x;
      umbrella.y = before.y;
      return;
    }
    render();
  }
  doc.addEventListener("pointerup", endPress, true);
  doc.addEventListener("pointercancel", () => { endPress(); clearCursor(); }, true);
  art.addEventListener("lostpointercapture", () => { if (pressed?.dragging) endPress(); });
  art.addEventListener("keydown", (event) => {
    const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!Object.hasOwn(offsets, event.key)) return;
    event.preventDefault();
    const distance = event.shiftKey ? 36 : 12;
    const [x, y] = offsets[event.key];
    moveTo(umbrella.x + x * distance, umbrella.y + y * distance);
  });
  doc.addEventListener("click", (event) => {
    if (suppressClick) { suppressClick = false; return; }
    if (event.defaultPrevented || event.button > 0 || event.detail === 0 && event.target !== art || excluded(event.target)) return;
    if (!doc.getSelection()?.isCollapsed) return;
    pressed = null;
    activateUmbrella(
      umbrella, event.target === art ? umbrella.x : event.clientX + view.scrollX, event.target === art ? umbrella.y : event.clientY + view.scrollY,
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
  finePointer.addEventListener("change", clearCursor);
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) settle(); });
  view.addEventListener("blur", settle);
  view.addEventListener("resize", () => {
    positionUmbrella(umbrella, umbrella.x, umbrella.y, doc.documentElement.clientWidth, Math.max(doc.documentElement.scrollHeight, view.innerHeight));
    settle();
  });
  view.addEventListener("scroll", () => { clearCursor(); render(); }, { passive: true });
  new view.ResizeObserver(render).observe(doc.querySelector(".page"));
  return {
    canopy() {
      if (!umbrella.placed || umbrella.progress <= 0 || art.hidden) return null;
      return umbrellaCanopy(umbrella, art.getBoundingClientRect(), Number.parseFloat(view.getComputedStyle(art).lineHeight));
    },
  };
}
