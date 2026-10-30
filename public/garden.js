import { GRID_X, GRID_Y, OUTSIDE_RAIN_VISIBILITY, RAIN_INK, addRipple, createRain, moveShelter, overlapsText, rainOpacity, resizeRain, stepRain } from "./rain.js";
import { createRainAudio } from "./rain-audio.js";
import { installInteractionSounds } from "./interaction-sounds.js";
import { installUmbrella } from "./umbrella.js";
import { decorateHouse } from "./house.js";

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

let motionEnabled = false;
let frame = 0;
let lastTime = 0;
let nextFrameAt = 0;
let protectedText = [];
let readingArea;
let windowPane;
let textNeedsUpdate = true;
let audio;
let soundEnabled = false;
let touchFadeTimer;

function measureText() {
  protectedText = [];
  for (const element of document.querySelectorAll("h1, h2, h3, h4, p, dt, dd, a, .eyebrow, .work-links, .section-aside, .garden-controls, .about-garden, [data-window-ink], .window-caption")) {
    const range = document.createRange();
    range.selectNodeContents(element);
    protectedText.push(...Array.from(range.getClientRects()));
  }
  const column = document.querySelector(".work-section, .links-main").getBoundingClientRect();
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
  textNeedsUpdate = false;
}

function resize() {
  const scale = Math.min(devicePixelRatio || 1, 2);
  const width = document.documentElement.clientWidth;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(innerHeight * scale);
  context?.setTransform(scale, 0, 0, scale, 0, 0);
  resizeRain(rain, width, innerHeight);
  textNeedsUpdate = true;
  if (!motionEnabled) render();
}

function glyph(text, x, y, opacity) {
  if (opacity < 0.005 || overlapsText(x, y, protectedText)) return;
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

  for (const ripple of rain.ripples) {
    const radius = 4 + ripple.age * 25;
    const opacity = (1 - ripple.age / 1.8) * 0.42 * OUTSIDE_RAIN_VISIBILITY;
    glyph("(", ripple.x - radius, rain.groundY, opacity);
    glyph(")", ripple.x + radius, rain.groundY, opacity);
    glyph("~", ripple.x, rain.groundY + 3, opacity * 0.7);
  }

  for (let x = 11; x < rain.width; x += GRID_X) {
    const opacity = rainOpacity(rain, x, rain.groundY + 13, readingArea, undefined) * 0.5;
    glyph(Math.sin(x * 0.08) > 0 ? "_" : ".", x, rain.groundY + 13, opacity);
  }
  context.globalAlpha = 1;
}

function draw(now) {
  if (!motionEnabled || document.hidden) return;
  frame = requestAnimationFrame(draw);
  if (now < nextFrameAt) return;
  if (textNeedsUpdate) measureText();
  rain.umbrella = umbrella.canopy();
  stepRain(rain, lastTime ? (now - lastTime) / 1000 : 1 / 30);
  lastTime = now;
  nextFrameAt = (nextFrameAt || now) + 1000 / 30;
  if (nextFrameAt < now - 1000 / 30) nextFrameAt = now + 1000 / 30;
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

async function setSound(enabled, feedback = false) {
  soundButton.disabled = true;
  try {
    if (enabled) {
      audio ??= createRainAudio();
      await audio.play();
      audio.shelter(motionEnabled ? rain.shelter.strength : 0);
      if (document.hidden) await audio.pause();
      else if (feedback) audio.effect("sound-on");
    } else if (audio) {
      if (feedback && !document.hidden) audio.effect("sound-off");
      await audio.pause();
    }
    soundEnabled = enabled;
    soundButton.setAttribute("aria-pressed", String(enabled));
    soundLabel.textContent = `sound ${enabled ? "on" : "off"}`;
    status.textContent = "";
  } catch (error) {
    console.error("Rain soundscape:", error);
    soundButton.setAttribute("aria-pressed", String(soundEnabled));
    soundLabel.textContent = `sound ${soundEnabled ? "on" : "off"}`;
    status.textContent = error instanceof Error ? error.message : "The rain soundscape couldn't start. Please try again.";
  } finally {
    soundButton.disabled = false;
  }
}

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
if (context) decorateHouse(document);
if (!context) {
  motionButton.disabled = true;
  status.textContent = "The ASCII rain needs canvas support. All the writing and links still work.";
}
resize();
setMotion(!reducedMotion.matches);
