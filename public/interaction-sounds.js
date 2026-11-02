function tone(pitch, duration, volume, extra = {}) {
  return Object.freeze({ at: 0, pitch, duration, volume, wave: "triangle", noiseVolume: 0.16, ...extra });
}

export const INTERACTION_SOUNDS = Object.freeze({
  navigation: Object.freeze([tone(480, 0.065, 0.01, { noiseVolume: 0.65, noiseDuration: 0.055 })]),
  link: Object.freeze([tone(1250, 0.07, 0.01, { wave: "sine", middlePitch: 1450, endPitch: 1650 })]),
  contact: Object.freeze([tone(950, 0.065, 0.011), tone(1350, 0.07, 0.008, { at: 0.05 })]),
  node: Object.freeze([tone(330, 0.055, 0.018, { middlePitch: 270, endPitch: 210, noiseVolume: 0.28 })]),
  connection: Object.freeze([tone(560, 0.085, 0.013, { wave: "sine" }), tone(840, 0.085, 0.01, { at: 0.045, wave: "sine" })]),
  clear: Object.freeze([tone(240, 0.13, 0.006, { wave: "sine", noiseVolume: 1.5, noiseAttack: 0.018, noiseDuration: 0.12 })]),
  undo: Object.freeze([tone(520, 0.08, 0.01, { middlePitch: 390, endPitch: 300 })]),
  redo: Object.freeze([tone(300, 0.08, 0.01, { middlePitch: 390, endPitch: 520 })]),
  "umbrella-open": Object.freeze([tone(180, 0.15, 0.008, { middlePitch: 240, endPitch: 330, noiseVolume: 1.8, noiseAttack: 0.018, noiseDuration: 0.14 })]),
  "umbrella-close": Object.freeze([tone(330, 0.12, 0.007, { middlePitch: 210, endPitch: 140, noiseVolume: 1.4, noiseAttack: 0.012, noiseDuration: 0.11 })]),
  weather: Object.freeze([tone(820, 0.09, 0.013, { wave: "sine" }), tone(610, 0.09, 0.008, { at: 0.06, wave: "sine" })]),
  "sound-on": Object.freeze([tone(420, 0.08, 0.012), tone(650, 0.08, 0.009, { at: 0.05 })]),
  "sound-off": Object.freeze([tone(650, 0.07, 0.01), tone(420, 0.07, 0.007, { at: 0.04 })]),
  button: Object.freeze([tone(540, 0.045, 0.01)]),
  rain: Object.freeze([tone(1500, 0.16, 0.025, { wave: "sine", noiseVolume: 0.3 })]),
});

export function classifyActivation({ href = null, control = null, inGraph = false, editable = false, background = false }, baseURL) {
  if (editable) return null;
  if (href !== null) {
    const url = new URL(href, baseURL);
    if (url.protocol === "mailto:" || url.protocol === "tel:") return "contact";
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.origin === new URL(baseURL).origin ? "navigation" : "link";
  }
  if (inGraph || control === "sound-toggle") return null;
  if (control === "motion-toggle") return "weather";
  if (control !== null) return "button";
  return background ? "rain" : null;
}

function describeTarget(target, baseURL, background = false) {
  const element = target?.nodeType === 3 ? target.parentElement : target;
  if (!element?.closest) return null;
  if (element.closest(".click-umbrella")) return null;
  const anchor = element.closest("a[href]");
  const button = element.closest("button");
  return classifyActivation({
    href: anchor?.getAttribute("href") ?? null,
    control: button ? button.id || "button" : null,
    inGraph: Boolean(element.closest("[data-graph-playground]")),
    editable: Boolean(element.closest("input, textarea, select, [contenteditable]")),
    background,
  }, baseURL);
}

export function installInteractionSounds(document, play) {
  let pointer = null;
  let dragged = false;
  let pressedLink = null;
  const removers = [];
  function listen(type, listener, capture = false) {
    document.addEventListener(type, listener, capture);
    removers.push(() => document.removeEventListener(type, listener, capture));
  }
  listen("pointerdown", (event) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    dragged = false;
    pressedLink = null;
    const anchor = event.target.closest?.("a[href]");
    if (!anchor) return;
    const kind = describeTarget(anchor, document.baseURI);
    // Let link feedback start at press, before ordinary navigation can unload audio.
    if (kind && play(kind)) pressedLink = { anchor, at: performance.now() };
  }, true);
  listen("pointermove", (event) => {
    if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 6) dragged = true;
  }, true);
  listen("pointerup", (event) => {
    if (pointer?.id === event.pointerId) pointer = null;
  }, true);
  listen("pointercancel", () => { pointer = null; dragged = true; pressedLink = null; }, true);
  listen("click", (event) => {
    if (event.defaultPrevented || event.button > 0) return;
    const anchor = event.target.closest?.("a[href]");
    if (event.detail > 0 && anchor === pressedLink?.anchor && performance.now() - pressedLink.at < 800) {
      pressedLink = null;
      return;
    }
    if (event.detail > 0 && dragged) return;
    const kind = describeTarget(event.target, document.baseURI, event.detail > 0);
    if (kind === "rain" && !document.getSelection()?.isCollapsed) return;
    if (kind) play(kind);
  });
  listen("site:interaction", (event) => {
    if (event.target.closest?.("[data-graph-playground]")) play(event.detail.kind);
  });
  return () => removers.forEach((remove) => remove());
}
