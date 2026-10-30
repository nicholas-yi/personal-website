import { GRID_X, GRID_Y, RAIN_INK, addRipple, createRain, moveShelter, indexText, overlapsIndexedText, rainOpacity, resizeRain, stepRain } from "./rain.js";
import { createRainAudio } from "./rain-audio.js";
import { installInteractionSounds } from "./interaction-sounds.js";
import { installUmbrella } from "./umbrella.js";
import { decorateHouse } from "./house.js";
import { installListening } from "./listening.js";
import { installHearth } from "./hearth.js";
import { installPuddles } from "./puddles.js";

const canvas = document.querySelector("#garden");
const context = canvas.getContext("2d");
const controls = document.querySelector(".garden-controls");
const motionButton = document.querySelector("#motion-toggle");
const motionLabel = document.querySelector("#motion-label");
const soundButton = document.querySelector("#sound-toggle");
const soundLabel = document.querySelector("#sound-label");
const status = document.querySelector("#garden-status");
const hint = document.querySelector("#garden-hint");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const rain = createRain(document.documentElement.clientWidth, innerHeight);
const puddles = installPuddles(document);

const sectionLinks = [...document.querySelectorAll("nav a[href^='#']")].map((link) => ({
  link,
  section: document.getElementById(link.hash.slice(1)),
})).filter(({ section }) => section);
if (sectionLinks.length) {
  const header = document.querySelector(".site-header");
  let navigationFrame = 0;
  function updateNavigation() {
    navigationFrame = 0;
    const marker = header.getBoundingClientRect().bottom + 24;
    for (const { link, section } of sectionLinks) {
      const bounds = section.getBoundingClientRect();
      if (bounds.top <= marker && bounds.bottom > marker) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }
  function scheduleNavigation() {
    if (!navigationFrame) navigationFrame = requestAnimationFrame(updateNavigation);
  }
  window.addEventListener("scroll", scheduleNavigation, { passive: true });
  window.addEventListener("resize", scheduleNavigation);
  window.addEventListener("hashchange", scheduleNavigation);
  new ResizeObserver(scheduleNavigation).observe(document.querySelector(".page"));
  updateNavigation();
}

let motionEnabled = false;
let frame = 0;
let lastTime = 0;
let nextFrameAt = 0;
let protectedText = [];
let textIndex;
let readingArea;
let windowPane;
let textNeedsUpdate = true;
let audio;
let soundEnabled = true;
let soundAwaitingGesture = true;
let soundRequest = 0;
let touchFadeTimer;

function measureText() {
  protectedText = [];
  for (const element of document.querySelectorAll("h1, h2, h3, h4, p, dt, dd, a, .eyebrow, .work-links, .garden-controls, .about-garden, [data-window-ink], .window-caption")) {
    const range = document.createRange();
    range.selectNodeContents(element);
    protectedText.push(...Array.from(range.getClientRects()));
  }
  const column = document.querySelector(".work-section, .links-main, .about-main, .error-main").getBoundingClientRect();
  readingArea = {
    left: column.left - 6,
    right: column.right + 6,
    top: 0,
    bottom: innerHeight,
  };
  const pane = document.querySelector(".rain-pane");
  windowPane = pane?.getClientRects().length ? pane.getBoundingClientRect() : undefined;
  const roof = document.querySelector(".house-roof");
  rain.house = roof ? {
    roof: roof.getBoundingClientRect(),
    body: document.querySelector(".house-body").getBoundingClientRect(),
  } : null;
  for (const element of document.querySelectorAll(".work-art, .house-body, .hearth, [data-graph-playground]")) {
    protectedText.push(element.getBoundingClientRect());
  }
  textIndex = indexText(rain.width, rain.height, protectedText);
  const water = puddles.measure();
  rain.groundY = water && water.top < innerHeight ? water.top + 55 : rain.height + 16;
  textNeedsUpdate = false;
}

function resize() {
  const scale = Math.min(devicePixelRatio || 1, 1.5);
  const width = document.documentElement.clientWidth;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(innerHeight * scale);
  context?.setTransform(scale, 0, 0, scale, 0, 0);
  resizeRain(rain, width, innerHeight);
  textNeedsUpdate = true;
  if (!motionEnabled) render();
}

function glyph(text, x, y, opacity) {
  if (opacity < 0.005 || overlapsIndexedText(textIndex, x, y)) return;
  context.globalAlpha = opacity;
  context.fillText(text, x, y);
}

function render() {
  if (!context) return;
  if (textNeedsUpdate) measureText();
  rain.umbrella = umbrella.canopy();
  context.clearRect(0, 0, rain.width, rain.height);
  context.font = "600 13px Consolas, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = RAIN_INK;

  for (const drop of rain.drops) {
    const x = Math.round(drop.x / GRID_X) * GRID_X;
    const y = Math.round(drop.y / GRID_Y) * GRID_Y;
    const bending = Math.abs(drop.vx) > drop.speed * 0.23;
    const opacity = rainOpacity(rain, x, y, readingArea, windowPane, bending) * (0.85 + Math.sin(drop.phase) * 0.15);
    const slant = bending ? drop.vx > 0 ? "\\" : "/" : "|";
    glyph(drop.onRoof || drop.bead ? "o" : slant !== "|" ? slant : drop.glyph, x, y, opacity);
    if (drop.bead || drop.trail) {
      const trailX = Math.round((drop.x - drop.vx * 0.045) / GRID_X) * GRID_X;
      const trailY = Math.round((drop.y - drop.vy * 0.045) / GRID_Y) * GRID_Y;
      const tailOpacity = rainOpacity(rain, trailX, trailY, readingArea, windowPane, bending) * 0.72;
      glyph(drop.bead ? "'" : slant, trailX, trailY, tailOpacity);
    }
  }

  context.globalAlpha = 1;
  puddles.render(rain.time, rain.ripples);
}

function draw(now) {
  if (!motionEnabled || document.hidden) return;
  frame = requestAnimationFrame(draw);
  if (now < nextFrameAt) return;
  if (textNeedsUpdate) measureText();
  rain.umbrella = umbrella.canopy();
  stepRain(rain, lastTime ? (now - lastTime) / 1000 : 1 / 30);
  lastTime = now;
  nextFrameAt = now + 1000 / 24;
  render();
  if (soundEnabled) audio?.shelter(rain.shelter.strength);
}

function startFrames() {
  cancelAnimationFrame(frame);
  lastTime = 0;
  nextFrameAt = 0;
  if (motionEnabled && !document.hidden) frame = requestAnimationFrame(draw);
}

function releaseShelter() {
  clearTimeout(touchFadeTimer);
  rain.pointer.active = false;
}

function setMotion(enabled) {
  motionEnabled = enabled && Boolean(context);
  motionButton.setAttribute("aria-pressed", String(motionEnabled));
  motionLabel.textContent = motionEnabled ? "rain on" : "rain paused";
  motionButton.setAttribute("aria-label", motionEnabled ? "Pause rain animation" : "Enable rain animation");
  motionButton.title = motionButton.getAttribute("aria-label");
  document.documentElement.dataset.rain = motionEnabled ? "moving" : "still";
  if (hint) {
    hint.hidden = false;
    hint.querySelector("span:last-child").textContent = motionEnabled
      ? "Let it rain. Make yourself at home."
      : "A little stillness. Make yourself at home.";
  }
  if (!motionEnabled) {
    releaseShelter();
    rain.shelter.strength = 0;
    audio?.shelter(0);
  }
  textNeedsUpdate = true;
  startFrames();
  render();
}

function labelSound(enabled, loading = false) {
  soundLabel.textContent = loading ? "sound loading" : `sound ${enabled ? "on" : "off"}`;
  soundButton.setAttribute("aria-label", enabled ? "Mute sound" : "Enable sound");
  soundButton.title = soundButton.getAttribute("aria-label");
  soundButton.setAttribute("aria-busy", String(loading));
}

async function setSound(enabled, feedback = false) {
  const request = ++soundRequest;
  soundEnabled = enabled;
  soundButton.setAttribute("aria-pressed", String(enabled));
  labelSound(enabled, enabled);
  try {
    if (enabled) {
      audio ??= createRainAudio();
      await audio.play();
      if (request !== soundRequest) return;
      stopWaitingForSound();
      audio.shelter(motionEnabled ? rain.shelter.strength : 0);
      if (document.hidden) await audio.pause();
      else if (feedback) audio.effect("sound-on");
    } else if (audio) {
      if (feedback && !document.hidden) audio.effect("sound-off");
      await audio.pause();
    }
    if (request !== soundRequest) return;
    soundEnabled = enabled;
    if (!enabled) stopWaitingForSound();
    soundButton.setAttribute("aria-pressed", String(enabled));
    labelSound(enabled);
    status.textContent = "";
  } catch (error) {
    if (request !== soundRequest) return;
    console.error("Rain soundscape:", error);
    if (enabled) soundEnabled = false;
    stopWaitingForSound();
    soundButton.setAttribute("aria-pressed", String(soundEnabled));
    labelSound(soundEnabled);
    status.textContent = error instanceof Error ? error.message : "The rain soundscape couldn't start. Please try again.";
  }
}

function stopWaitingForSound() {
  soundAwaitingGesture = false;
  document.removeEventListener("pointerdown", startDefaultSound, true);
  document.removeEventListener("keydown", startDefaultSound, true);
}
function startDefaultSound(event) {
  if (!event.isTrusted || !soundEnabled || !soundAwaitingGesture || document.hidden ||
      event.target.closest("#sound-toggle") || event.type === "pointerdown" && (event.button !== 0 || event.isPrimary === false) ||
      event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
  stopWaitingForSound();
  setSound(true);
}
soundButton.title = "Sound is enabled and starts with your first click or Enter/Space action.";
document.addEventListener("pointerdown", startDefaultSound, true);
document.addEventListener("keydown", startDefaultSound, true);
motionButton.addEventListener("click", () => setMotion(!motionEnabled));
soundButton.addEventListener("click", () => setSound(!soundEnabled, true));
function playInteraction(kind) {
  if (!soundEnabled || document.hidden) return false;
  return audio?.effect(kind) ?? false;
}
installInteractionSounds(document, (kind) => kind === "rain" ? false : playInteraction(kind));
const umbrella = installUmbrella(document, {
  onChange() { if (!motionEnabled) render(); },
  onToggle(open) { playInteraction(open ? "umbrella-open" : "umbrella-close"); },
});
reducedMotion.addEventListener("change", () => setMotion(!reducedMotion.matches));
window.addEventListener("resize", resize);
window.addEventListener("scroll", () => {
  textNeedsUpdate = true;
  if (!motionEnabled) render();
}, { passive: true });
new ResizeObserver(() => {
  textNeedsUpdate = true;
  if (!motionEnabled) render();
}).observe(document.querySelector(".page"));

window.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch" || !motionEnabled) return;
  if (event.target.closest("[data-graph-playground]")) {
    releaseShelter();
    return;
  }
  clearTimeout(touchFadeTimer);
  moveShelter(rain, event.clientX, event.clientY);
}, { passive: true });
document.documentElement.addEventListener("pointerleave", releaseShelter);
window.addEventListener("blur", releaseShelter);
window.addEventListener("pointerdown", (event) => {
  if (!motionEnabled || event.button !== 0 || event.target.closest("a, button, input, select, textarea, [data-graph-playground]")) return;
  clearTimeout(touchFadeTimer);
  moveShelter(rain, event.clientX, event.clientY);
  addRipple(rain, event.clientX);
}, { passive: true });
window.addEventListener("pointerup", (event) => {
  if (event.pointerType === "touch") touchFadeTimer = setTimeout(releaseShelter, 2400);
}, { passive: true });
window.addEventListener("pointercancel", releaseShelter);

document.addEventListener("visibilitychange", async () => {
  releaseShelter();
  startFrames();
  if (!soundEnabled || !audio) return;
  if (document.hidden) {
    try {
      await audio.pause();
    } catch (error) {
      console.error("Couldn't pause the rain soundscape:", error);
      status.textContent = "Couldn't pause the soundscape. Use the sound button to turn it off.";
    }
  } else {
    await setSound(true);
  }
});

controls.hidden = false;
installListening(document);
installHearth(document);
if (context) decorateHouse(document);
if (!context) {
  motionButton.disabled = true;
  status.textContent = "The ASCII rain needs canvas support. All the writing and links still work.";
}
resize();
setMotion(!reducedMotion.matches);
