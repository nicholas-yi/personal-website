import test from "node:test";
import assert from "node:assert/strict";
import { MAX_RAIN_VOICES, RAIN_RECORDINGS, RAIN_PLAYBACK_MULTIPLIER, FIREPLACE_RECORDING, MAX_FIREPLACE_MIX, NEAR_RAIN_MIX, fireplaceProximity, fireplaceMix, createRainAudio, createRainPhrase, seamlessRainBuffer } from "../public/rain-audio.js";

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
      kind, gain: new Parameter(), frequency: new Parameter(), Q: new Parameter(), pan: new Parameter(), playbackRate: new Parameter(),
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
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { duration: length / sampleRate, length, sampleRate, numberOfChannels: channels, getChannelData: (channel) => data[channel] };
  }
  async decodeAudioData() { return this.createBuffer(2, 10000, this.sampleRate); }
  async resume() {
    if (this.resumeError) throw this.resumeError;
    this.state = "running";
  }
  async suspend() {
    if (this.suspendError) throw this.suspendError;
    this.state = "suspended";
  }
}

function setup({ fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) } = {}) {
  const context = new FakeContext();
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  const audio = createRainAudio({
    AudioContext: function () { return context; },
    fetch,
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

test("natural rain playback is exactly 25 percent slower, with a quieter leaf layer and no synthetic ambient drips", () => {
  assert.equal(RAIN_PLAYBACK_MULTIPLIER, 0.75);
  const random = randomSeed();
  const phrases = Array.from({ length: 32 }, () => createRainPhrase(random));
  assert.ok(new Set(phrases.map((phrase) => phrase.seconds)).size > 20);
  assert.ok(new Set(phrases.map((phrase) => phrase.bodyGain)).size > 20);
  for (const phrase of phrases) {
    assert.ok(phrase.seconds >= 8 && phrase.seconds < 12);
    assert.ok(phrase.bodyRate >= 1.15 * 0.75 && phrase.bodyRate < 1.21 * 0.75);
    assert.ok(phrase.patterRate >= 1.24 * 0.75 && phrase.patterRate < 1.32 * 0.75);
    assert.ok(phrase.patterGain < phrase.bodyGain / 2);
    assert.ok(phrase.bodyHz <= 4400 && phrase.patterHz <= 4000);
    assert.ok(!Object.hasOwn(phrase, "drips"));
  }
});

test("audio is silent before activation, then loops three stereo field recordings without synthesized rain drops", async () => {
  const { audio, context, timers } = setup();
  assert.equal(context.state, "suspended");
  assert.equal(context.nodes.filter((node) => node.kind === "oscillator").length, 0);
  assert.equal(timers.size, 0);
  await audio.play();
  assert.equal(context.state, "running");
  assert.equal(context.nodes.filter((node) => node.kind === "source" && node.loop).length, 3);
  const drips = context.nodes.filter((node) => node.kind === "oscillator");
  assert.equal(drips.length, 0);
  const loops = context.nodes.filter((node) => node.kind === "source" && node.loop);
  assert.ok(loops.every((node) => node.buffer.numberOfChannels === 2));
  assert.ok(loops[0].playbackRate.value >= 1.15 * 0.75 && loops[0].playbackRate.value < 1.21 * 0.75);
  assert.ok(loops[1].playbackRate.value >= 1.24 * 0.75 && loops[1].playbackRate.value < 1.32 * 0.75);
  assert.equal(timers.size, 1);
});

test("loop overlap joins original tail to head on both channels without changing source buffers", () => {
  const context = new FakeContext();
  const source = context.createBuffer(2, 10000, 1000);
  for (let channel = 0; channel < 2; channel++) {
    const data = source.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i / 70 + channel) * 0.1;
  }
  const original = source.getChannelData(0).slice();
  const result = seamlessRainBuffer(context, source);
  assert.equal(result.length, 8000);
  assert.equal(result.numberOfChannels, 2);
  for (let channel = 0; channel < 2; channel++) {
    assert.equal(result.getChannelData(channel)[0], source.getChannelData(channel)[8000]);
    assert.ok(Math.abs(result.getChannelData(channel)[1999] - source.getChannelData(channel)[1999]) < 0.000001);
    assert.equal(result.getChannelData(channel)[7999], source.getChannelData(channel)[7999]);
  }
  assert.deepEqual(source.getChannelData(0), original);
  assert.throws(() => seamlessRainBuffer(context, context.createBuffer(1, 2000, 1000)), /too short/);
});

test("recordings are fetched once per audio instance and repeated activation cannot duplicate loops", async () => {
  const requested = [];
  const { audio, context } = setup({ fetch: async (url) => {
    requested.push(url);
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  } });
  assert.equal(requested.length, 0);
  await Promise.all([audio.play(), audio.play()]);
  await audio.play();
  assert.deepEqual(requested, [...RAIN_RECORDINGS, FIREPLACE_RECORDING]);
  assert.equal(context.nodes.filter((node) => node.loop).length, 3);
});

test("failed recordings are explicit, suspended, retryable, and never replaced with white noise", async () => {
  let fails = true;
  const { audio, context } = setup({ fetch: async () => ({
    ok: !fails, status: 404, arrayBuffer: async () => new ArrayBuffer(8),
  }) });
  await assert.rejects(audio.play(), /Couldn't load the sound recording \(404\)/);
  assert.equal(context.state, "suspended");
  assert.equal(context.nodes.filter((node) => node.loop).length, 0);
  fails = false;
  await audio.play();
  assert.equal(context.state, "running");
  assert.equal(context.nodes.filter((node) => node.loop).length, 3);
});

test("fireplace proximity is viewport-based, fades at the edges, and increases toward the hearth", () => {
  assert.equal(fireplaceProximity({ top: 2000, bottom: 2100 }, 1000), 0);
  assert.equal(fireplaceProximity({ top: -200, bottom: -100 }, 1000), 0);
  assert.equal(fireplaceProximity({ top: 600, bottom: 700 }, 1000), 1);
  const entering = fireplaceProximity({ top: 950, bottom: 1050 }, 1000);
  const nearer = fireplaceProximity({ top: 800, bottom: 900 }, 1000);
  assert.ok(entering > 0 && entering < nearer && nearer < 1);
  for (let top = -300; top <= 2000; top += 20) {
    const value = fireplaceProximity({ top, bottom: top + 100 }, 1000);
    assert.ok(value >= 0 && value <= 1);
  }
  assert.throws(() => fireplaceProximity(null, 1000), TypeError);
  assert.throws(() => fireplaceProximity({ top: 1, bottom: 0 }, 1000), TypeError);
  assert.throws(() => fireplaceProximity({ top: 0, bottom: 100 }, 0), TypeError);
});

test("fire crackling rises as rain recedes and cannot bypass mute or create extra loops/timers", async () => {
  const { audio, context, timers, advance } = setup();
  assert.deepEqual(fireplaceMix(0), { rain: 1, fire: 0 });
  assert.equal(MAX_FIREPLACE_MIX, 0.65 * 1.35 * 1.25);
  assert.equal(NEAR_RAIN_MIX, 0.3 * 0.75);
  assert.deepEqual(fireplaceMix(1), { rain: NEAR_RAIN_MIX, fire: MAX_FIREPLACE_MIX });
  assert.deepEqual(fireplaceMix(-10), fireplaceMix(0));
  assert.deepEqual(fireplaceMix(10), fireplaceMix(1));
  assert.throws(() => fireplaceMix(NaN), TypeError);
  audio.fireplace(1);
  await audio.play();
  const gains = context.nodes.filter(node => node.kind === "gain");
  assert.equal(gains[1].gain.value, fireplaceMix(1).rain);
  assert.equal(gains[2].gain.value, fireplaceMix(1).fire);
  const sources = context.nodes.filter(node => node.loop);
  assert.equal(sources.length, 3);
  assert.equal(sources[2].playbackRate.value, 1);
  audio.fireplace(0);
  assert.equal(gains[1].gain.value, 1);
  assert.equal(gains[2].gain.value, 0);
  assert.equal(timers.size, 1);
  const pause = audio.pause();
  audio.fireplace(1);
  assert.equal(gains[0].gain.value, 0);
  await advance(160);
  await pause;
  assert.equal(context.state, "suspended");
  assert.equal(timers.size, 0);
  await audio.play();
  assert.equal(gains[2].gain.value, MAX_FIREPLACE_MIX);
  assert.equal(context.nodes.filter(node => node.loop).length, 3);
});

test("the page-end mix reaches the requested rain/fire targets regardless of viewport placement", () => {
  for (const height of [390, 600, 900, 1200]) {
    for (const top of [-300, 50, 300, 1500]) {
      const bottom = fireplaceProximity({ top, bottom: top + 100 }, height, 0);
      assert.equal(bottom, 1);
      const mix = fireplaceMix(bottom);
      assert.equal(mix.rain, NEAR_RAIN_MIX);
      assert.equal(mix.fire, MAX_FIREPLACE_MIX);
    }
  }
  assert.equal(fireplaceProximity({ top: 2000, bottom: 2100 }, 900, 900), 0);
  assert.equal(fireplaceProximity({ top: 2000, bottom: 2100 }, 900, 225), 0.5);
  assert.throws(() => fireplaceProximity({ top: 0, bottom: 100 }, 900, -1), TypeError);
  assert.throws(() => fireplaceProximity({ top: 0, bottom: 100 }, 900, NaN), TypeError);
});

test("decode failure is explicit and suspends the context instead of playing an incomplete layer", async () => {
  const { audio, context } = setup();
  context.decodeAudioData = async () => { throw new Error("Unreadable audio"); };
  await assert.rejects(audio.play(), /Unreadable audio/);
  assert.equal(context.state, "suspended");
  assert.equal(context.nodes.filter((node) => node.loop).length, 0);
});

test("muting during a pending download prevents the eventual decode from starting audible rain", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { audio, context, advance, timers } = setup({ fetch: async () => {
    await gate;
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  } });
  const playing = audio.play();
  const paused = audio.pause();
  await advance(160);
  await paused;
  release();
  await playing;
  assert.equal(context.state, "suspended");
  assert.equal(context.nodes.find((node) => node.kind === "gain").gain.value, 0);
  assert.equal(timers.size, 0);
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
