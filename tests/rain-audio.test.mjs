import test from "node:test";
import assert from "node:assert/strict";
import { MAX_RAIN_VOICES, createRainAudio, createRainPhrase } from "../public/rain-audio.js";

function randomSeed() {
  let seed = 42;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

class Parameter {
  value = 0;
  events = [];
  cancelScheduledValues(time) { this.events.push(["cancel", time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(["set", value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(["linear", value, time]); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(["exponential", value, time]); }
  setTargetAtTime(value, time, duration) { this.value = value; this.events.push(["target", value, time, duration]); }
}

class FakeContext {
  sampleRate = 1000;
  currentTime = 0;
  state = "suspended";
  nodes = [];
  destination = {};
  node(kind) {
    const node = {
      kind, gain: new Parameter(), frequency: new Parameter(), Q: new Parameter(), pan: new Parameter(),
      starts: [], stops: [], disconnected: false,
      connect(target) { return target; },
      disconnect() { this.disconnected = true; },
      start(...args) { this.starts.push(args); },
      stop(...args) { this.stops.push(args); },
    };
    this.nodes.push(node);
    return node;
  }
  createGain() { return this.node("gain"); }
  createBiquadFilter() { return this.node("filter"); }
  createOscillator() { return this.node("oscillator"); }
  createBufferSource() { return this.node("source"); }
  createStereoPanner() { return this.node("pan"); }
  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => data };
  }
  async resume() {
    if (this.resumeError) throw this.resumeError;
    this.state = "running";
  }
  async suspend() {
    if (this.suspendError) throw this.suspendError;
    this.state = "suspended";
  }
}

function setup() {
  const context = new FakeContext();
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  const audio = createRainAudio({
    AudioContext: function () { return context; },
    random: randomSeed(),
    setTimer(callback, delay) {
      const id = ++sequence;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
  });
  async function advance(milliseconds) {
    const end = now + milliseconds;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      timers.delete(id);
      now = timer.at;
      context.currentTime = now / 1000;
      timer.callback();
      await Promise.resolve();
    }
    now = end;
    context.currentTime = now / 1000;
    await Promise.resolve();
  }
  return { audio, context, timers, advance };
}

test("weather phrases vary their rain layers and contain irregular single/double drips", () => {
  const random = randomSeed();
  const phrases = Array.from({ length: 32 }, () => createRainPhrase(random));
  assert.ok(new Set(phrases.map((phrase) => phrase.seconds)).size > 20);
  assert.ok(new Set(phrases.map((phrase) => phrase.bodyGain)).size > 20);
  for (const phrase of phrases) {
    assert.ok(phrase.seconds >= 6 && phrase.seconds < 10);
    assert.ok(phrase.drips.length >= 3 && phrase.drips.length <= 12);
    assert.ok(phrase.drips.some((note, i) => i && note.at - phrase.drips[i - 1].at < 0.4));
    for (const note of phrase.drips) {
      assert.ok(note.at >= 0.4 && note.at + note.duration < phrase.seconds);
      assert.ok(note.volume > 0 && note.volume <= 0.03);
      assert.ok(note.pitch >= 950 && note.pitch < 2450);
      assert.ok(Math.abs(note.pan) <= 0.35);
    }
  }
});

test("audio is silent before consent, then schedules two rain layers and varied water drops", async () => {
  const { audio, context, timers } = setup();
  assert.equal(context.state, "suspended");
  assert.equal(context.nodes.filter((node) => node.kind === "oscillator").length, 0);
  assert.equal(timers.size, 0);
  await audio.play();
  assert.equal(context.state, "running");
  assert.equal(context.nodes.filter((node) => node.kind === "source" && node.loop).length, 2);
  const drips = context.nodes.filter((node) => node.kind === "oscillator");
  assert.ok(drips.length >= 3);
  assert.ok(new Set(drips.map((node) => node.frequency.events[0][1])).size > 2);
  assert.ok(drips.every((node) => node.frequency.events.filter((event) => event[0] === "exponential").length === 2));
  assert.equal(timers.size, 1);
});

test("weather changes over time while scheduled voices remain bounded", async () => {
  const { audio, context, advance, timers } = setup();
  await audio.play();
  await advance(42000);
  const bodyFilter = context.nodes.find((node) => node.kind === "filter" && node.type === "lowpass" && node.frequency.events.some((event) => event[0] === "linear"));
  const targets = bodyFilter.frequency.events.filter((event) => event[0] === "linear");
  assert.ok(targets.length >= 5);
  assert.ok(new Set(targets.map((event) => event[1])).size >= 5);
  assert.ok(context.nodes.filter((node) => node.kind === "oscillator" && !node.disconnected).length <= MAX_RAIN_VOICES);
  assert.equal(timers.size, 1);
});

test("pausing cancels the phrase timer, fades, disposes drips, and truly suspends", async () => {
  const { audio, context, advance, timers } = setup();
  await audio.play();
  const stop = audio.pause();
  assert.equal(timers.size, 1);
  await advance(160);
  await stop;
  assert.equal(context.state, "suspended");
  assert.equal(timers.size, 0);
  assert.ok(context.nodes.filter((node) => node.kind === "oscillator").every((node) => node.disconnected));
  const count = context.nodes.length;
  await advance(30000);
  assert.equal(context.nodes.length, count);
});

test("a stale fade cannot suspend sound that has just been resumed", async () => {
  const { audio, context, advance, timers } = setup();
  await audio.play();
  const oldPause = audio.pause();
  await advance(40);
  await audio.play();
  await advance(160);
  await oldPause;
  assert.equal(context.state, "running");
  assert.equal(timers.size, 1);
  const pause = audio.pause();
  await advance(160);
  await pause;
  assert.equal(context.state, "suspended");
});

test("repeated play does not duplicate weather timers and shelter changes cannot unmute a fade", async () => {
  const { audio, context, advance, timers } = setup();
  for (let i = 0; i < 10; i++) await audio.play();
  assert.equal(timers.size, 1);
  assert.ok(context.nodes.filter((node) => node.kind === "oscillator" && !node.disconnected).length <= MAX_RAIN_VOICES);
  audio.shelter(1);
  const master = context.nodes.find((node) => node.kind === "gain");
  assert.equal(master.gain.value, 0.62 * 0.75);
  const pause = audio.pause();
  audio.shelter(0);
  assert.equal(master.gain.value, 0);
  await advance(160);
  await pause;
  assert.equal(context.state, "suspended");
});

test("unsupported audio and browser failures are explicit, not success-shaped fallbacks", async () => {
  assert.throws(() => createRainAudio({ AudioContext: null }), /doesn't support/);
  const { audio, context, advance } = setup();
  context.resumeError = new Error("Resume denied");
  await assert.rejects(audio.play(), /Resume denied/);
  context.resumeError = null;
  await audio.play();
  context.suspendError = new Error("Suspend denied");
  const pause = assert.rejects(audio.pause(), /Suspend denied/);
  await advance(160);
  await pause;
});

test("interaction sounds stay muted until enabled, use distinct timbres, and stop with audio", async () => {
  const { audio, context, advance } = setup();
  assert.equal(audio.effect("node"), false);
  assert.equal(context.nodes.filter((node) => node.kind === "oscillator").length, 0);
  assert.throws(() => audio.effect("toString"), /Unknown interaction sound/);
  await audio.play();
  assert.equal(audio.effect("node"), true);
  let latest = context.nodes.filter((node) => node.kind === "oscillator").at(-1);
  assert.equal(latest.type, "triangle");
  assert.equal(latest.frequency.events[0][1], 330);
  assert.equal(audio.effect("node"), false);
  await advance(100);
  assert.equal(audio.effect("link"), true);
  latest = context.nodes.filter((node) => node.kind === "oscillator").at(-1);
  assert.equal(latest.type, "sine");
  assert.equal(latest.frequency.events[0][1], 1250);
  const pause = audio.pause();
  assert.equal(audio.effect("rain"), false);
  await advance(160);
  await pause;
  assert.equal(context.state, "suspended");
});

test("rapid activations are rate-limited without starting extra weather timers", async () => {
  const { audio, context, advance, timers } = setup();
  await audio.play();
  let accepted = 0;
  for (let i = 0; i < 10; i++) {
    if (audio.effect("node")) accepted++;
    await advance(100);
  }
  assert.equal(accepted, 6);
  assert.equal(timers.size, 1);
  assert.ok(context.nodes.filter((node) => node.kind === "oscillator" && !node.disconnected).length <= MAX_RAIN_VOICES);
  await advance(10);
  assert.equal(audio.effect("connection"), true);
});

test("umbrella opening and closing feedback obeys the same audio consent and mute boundary", async () => {
  const { audio, context, advance } = setup();
  assert.equal(audio.effect("umbrella-open"), false);
  await audio.play();
  assert.equal(audio.effect("umbrella-open"), true);
  const opening = context.nodes.filter((node) => node.kind === "oscillator").at(-1);
  assert.equal(opening.frequency.events[0][1], 180);
  assert.ok(opening.frequency.events.some((event) => event[0] === "exponential" && event[1] === 330));
  await advance(120);
  assert.equal(audio.effect("umbrella-close"), true);
  const closing = context.nodes.filter((node) => node.kind === "oscillator").at(-1);
  assert.equal(closing.frequency.events[0][1], 330);
  assert.ok(closing.frequency.events.some((event) => event[0] === "exponential" && event[1] === 140));
  const pause = audio.pause();
  assert.equal(audio.effect("umbrella-open"), false);
  await advance(160);
  await pause;
  assert.equal(context.state, "suspended");
});
