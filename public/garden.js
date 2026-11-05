import { GRID_X, GRID_Y, addRipple, createRain, moveShelter, indexText, overlapsIndexedText, rainOpacity, resizeRain, stepRain } from "./rain.js";
import { createRainAudio, fireplaceProximity } from "./rain-audio.js";
import { installInteractionSounds } from "./interaction-sounds.js";
import { installUmbrella } from "./umbrella.js";
import { decorateHouse } from "./house.js";
import { installListening } from "./listening.js";
import { installHearth } from "./hearth.js";
import { installPuddles } from "./puddles.js";
import { installThoughts } from "./thoughts.js";
import { createRainGlyphs } from "./rain-glyphs.js";
import { installMailbox } from "./mailbox.js";
import { installHeaderGlass } from "./header-glass.js";
import { createRainPreference, installPageTools } from "./page-tools.js";
import { installSceneDetails } from "./scene-details.js";

const canvas = document.querySelector("#garden");
const context = canvas.getContext("2d");
const controls = document.querySelector(".garden-controls");
const motionButton = document.querySelector("#motion-toggle");
const motionLabel = document.querySelector("#motion-label");
const soundButton = document.querySelector("#sound-toggle");
const soundLabel = document.querySelector("#sound-label");
const status = document.querySelector("#garden-status");
const hint = document.querySelector("#garden-hint");
const graphActivity = document.querySelector("[data-graph-playground]");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const rainPreference = createRainPreference(window, message => { status.textContent = message; });
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
let layoutNeedsUpdate = true;
let sceneGeometry;
let rainGlyphs;
let audio;
let soundEnabled = false;
let soundRequest = 0;
let fireplaceAmount = 0;
let touchFadeTimer;
let graphHovered = false;

function measureText() {
  const documentRect = (rect) => rect && ({
    left: rect.left + scrollX, right: rect.right + scrollX,
    top: rect.top + scrollY, bottom: rect.bottom + scrollY,
    width: rect.width, height: rect.height,
  });
  const viewportRect = (rect) => rect && ({
    ...rect, left: rect.left - scrollX, right: rect.right - scrollX,
    top: rect.top - scrollY, bottom: rect.bottom - scrollY,
  });
  if (layoutNeedsUpdate) {
    const rectangles = [];
    for (const element of document.querySelectorAll("h1, h2, h3, h4, p, dt, dd, a, .eyebrow, .work-links, .about-garden, [data-window-ink], .window-caption")) {
      if (element.closest(".house-body, .work-art, [data-graph-playground], .site-header, .garden-controls")) continue;
      const range = document.createRange();
      range.selectNodeContents(element);
      rectangles.push(...Array.from(range.getClientRects(), documentRect));
    }
    for (const element of document.querySelectorAll(".work-art, .house-body, .hearth, [data-graph-playground]")) {
      rectangles.push(documentRect(element.getBoundingClientRect()));
    }
    const measure = (selector) => documentRect(document.querySelector(selector)?.getBoundingClientRect());
    sceneGeometry = {
      rectangles, column: measure(".work-section, .links-main, .about-main, .error-main"),
      pane: measure(".rain-pane"), roof: measure(".house-roof"), body: measure(".house-body"),
      water: measure(".page-puddles"), fireplace: measure(".hearth"),
    };
    layoutNeedsUpdate = false;
  }
  protectedText = sceneGeometry.rectangles.map(viewportRect);
  for (const selector of [".site-header", ".garden-controls"]) {
    protectedText.push(document.querySelector(selector).getBoundingClientRect());
  }
  const listeningCard = document.querySelector(".listening-card");
  if (listeningCard && !listeningCard.hidden) protectedText.push(listeningCard.getBoundingClientRect());
  const column = viewportRect(sceneGeometry.column);
  readingArea = {
    left: column.left - 6,
    right: column.right + 6,
    top: 0,
    bottom: innerHeight,
  };
  windowPane = viewportRect(sceneGeometry.pane);
  rain.house = sceneGeometry.roof ? { roof: viewportRect(sceneGeometry.roof), body: viewportRect(sceneGeometry.body) } : null;
  textIndex = indexText(rain.width, rain.height, protectedText);
  const water = puddles.measure(viewportRect(sceneGeometry.water));
  rain.groundY = water && water.top < innerHeight ? water.top + 55 : rain.height + 16;
  const fireplace = viewportRect(sceneGeometry.fireplace);
  fireplaceAmount = fireplace
    ? fireplaceProximity(fireplace, innerHeight, Math.max(0, document.documentElement.scrollHeight - innerHeight - scrollY))
    : 0;
  audio?.fireplace(fireplaceAmount);
  textNeedsUpdate = false;
}

function resize() {
  const scale = Math.min(devicePixelRatio || 1, 1.5);
  const width = document.documentElement.clientWidth;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(innerHeight * scale);
  context?.setTransform(scale, 0, 0, scale, 0, 0);
  if (context) rainGlyphs = createRainGlyphs(document, scale, getComputedStyle(document.documentElement).getPropertyValue("--rain-ink").trim());
  resizeRain(rain, width, innerHeight);
  textNeedsUpdate = true;
  layoutNeedsUpdate = true;
  if (!motionEnabled) render();
}

function glyph(text, x, y, opacity) {
  if (opacity < 0.005 || overlapsIndexedText(textIndex, x, y)) return;
  context.globalAlpha = opacity;
  rainGlyphs.draw(context, text, x, y);
}

function render() {
  if (!context) return;
  if (textNeedsUpdate) measureText();
  rain.umbrella = umbrella.canopy();
  context.clearRect(0, 0, rain.width, rain.height);
  context.font = "600 13px Consolas, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";

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
  applyAudioShelter();
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

function applyAudioShelter() {
  if (!soundEnabled) return;
  const graphSheltered = graphHovered || graphActivity?.contains(document.activeElement);
  audio?.shelter(graphSheltered ? 1 : motionEnabled ? rain.shelter.strength : 0);
}

function releaseInteractionShelter() {
  graphHovered = false;
  releaseShelter();
  applyAudioShelter();
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
    applyAudioShelter();
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
      audio.fireplace(fireplaceAmount);
      applyAudioShelter();
      await audio.play();
      if (request !== soundRequest) return;
      applyAudioShelter();
      if (document.hidden) await audio.pause();
      else if (feedback) audio.effect("sound-on");
    } else if (audio) {
      if (feedback && !document.hidden) audio.effect("sound-off");
      await audio.pause();
    }
    if (request !== soundRequest) return;
    soundEnabled = enabled;
    soundButton.setAttribute("aria-pressed", String(enabled));
    labelSound(enabled);
    status.textContent = "";
  } catch (error) {
    if (request !== soundRequest) return;
    console.error("Rain soundscape:", error);
    if (enabled) soundEnabled = false;
    soundButton.setAttribute("aria-pressed", String(soundEnabled));
    labelSound(soundEnabled);
    status.textContent = error instanceof Error ? error.message : "The rain soundscape couldn't start. Please try again.";
  }
}

labelSound(soundEnabled);
motionButton.addEventListener("click", () => {
  setMotion(!motionEnabled);
  rainPreference.remember(motionEnabled);
});
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
reducedMotion.addEventListener("change", () => setMotion(rainPreference.enabled(reducedMotion.matches)));
window.addEventListener("pageshow", event => {
  if (!event.persisted) return;
  rainPreference.restore();
  setMotion(rainPreference.enabled(reducedMotion.matches));
});
window.addEventListener("resize", resize);
window.addEventListener("themechange", () => {
  if (context) rainGlyphs = createRainGlyphs(document, Math.min(devicePixelRatio || 1, 1.5), getComputedStyle(document.documentElement).getPropertyValue("--rain-ink").trim());
  textNeedsUpdate = true;
  if (!motionEnabled) render();
});
window.addEventListener("scroll", () => {
  textNeedsUpdate = true;
  if (!motionEnabled) render();
}, { passive: true });
const layoutObserver = new ResizeObserver((entries) => {
  if (entries.some(entry => entry.target.matches(".page"))) layoutNeedsUpdate = true;
  textNeedsUpdate = true;
  if (!motionEnabled) render();
});
for (const element of document.querySelectorAll(".page, .listening-card")) layoutObserver.observe(element);
document.addEventListener("load", () => { layoutNeedsUpdate = true; textNeedsUpdate = true; }, true);
document.fonts?.ready.then(() => { layoutNeedsUpdate = true; textNeedsUpdate = true; if (!motionEnabled) render(); });

window.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch") return;
  if (event.target.closest("[data-graph-playground]")) {
    const entered = !graphHovered;
    graphHovered = true;
    releaseShelter();
    if (entered) applyAudioShelter();
    return;
  }
  if (graphHovered) {
    graphHovered = false;
    applyAudioShelter();
  }
  if (!motionEnabled) return;
  clearTimeout(touchFadeTimer);
  moveShelter(rain, event.clientX, event.clientY);
}, { passive: true });
graphActivity?.addEventListener("pointerenter", (event) => {
  if (event.pointerType === "touch") return;
  graphHovered = true;
  releaseShelter();
  applyAudioShelter();
});
graphActivity?.addEventListener("pointerleave", () => {
  graphHovered = false;
  applyAudioShelter();
});
graphActivity?.addEventListener("focusin", applyAudioShelter);
graphActivity?.addEventListener("focusout", () => queueMicrotask(applyAudioShelter));
document.documentElement.addEventListener("pointerleave", releaseInteractionShelter);
window.addEventListener("blur", releaseInteractionShelter);
window.addEventListener("pointerdown", (event) => {
  if (!motionEnabled || event.button !== 0 || event.target.closest("a, button, input, select, textarea, [data-graph-playground]")) return;
  clearTimeout(touchFadeTimer);
  moveShelter(rain, event.clientX, event.clientY);
  addRipple(rain, event.clientX);
}, { passive: true });
window.addEventListener("pointerup", (event) => {
  if (event.pointerType === "touch") touchFadeTimer = setTimeout(releaseShelter, 2400);
}, { passive: true });
window.addEventListener("pointercancel", releaseInteractionShelter);

document.addEventListener("visibilitychange", async () => {
  releaseInteractionShelter();
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
installThoughts(document);
installMailbox(document);
installHearth(document);
installHeaderGlass(document);
installPageTools(document);
installSceneDetails(document);
if (context) decorateHouse(document);
if (!context) {
  motionButton.disabled = true;
  status.textContent = "The ASCII rain needs canvas support. All the writing and links still work.";
}
resize();
setMotion(rainPreference.enabled(reducedMotion.matches));
