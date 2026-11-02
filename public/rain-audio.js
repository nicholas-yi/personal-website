export const MAX_RAIN_VOICES = 24;
export const RAIN_RECORDINGS = Object.freeze(["/audio/garden-rain.mp3", "/audio/forest-rain.mp3"]);
export const RAIN_PLAYBACK_MULTIPLIER = 0.75;
export const FIREPLACE_RECORDING = "/audio/fireplace.mp3";
export const MAX_FIREPLACE_MIX = 0.65 * 1.35 * 1.25;
export const NEAR_RAIN_MIX = 0.3 * 0.75;

export function fireplaceProximity(rect, viewportHeight, remainingScroll) {
  if (!rect || ![rect.top, rect.bottom, viewportHeight].every(Number.isFinite) || viewportHeight <= 0 || rect.bottom <= rect.top) {
    throw new TypeError("Fireplace proximity needs finite bounds and a positive viewport height.");
  }
  const visible = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0)) / (rect.bottom - rect.top);
  const distance = Math.abs((rect.top + rect.bottom) / 2 - viewportHeight * 0.65);
  if (remainingScroll !== undefined && (!Number.isFinite(remainingScroll) || remainingScroll < 0)) {
    throw new TypeError("Page-end proximity needs a finite nonnegative scroll distance.");
  }
  const pageEnd = remainingScroll === undefined ? 0 : Math.max(0, 1 - remainingScroll / (viewportHeight * 0.5));
  return Math.max(pageEnd, visible * Math.max(0, 1 - distance / (viewportHeight * 0.65)));
}

export function fireplaceMix(amount) {
  if (!Number.isFinite(amount)) throw new TypeError("Fireplace mix needs a finite proximity.");
  const proximity = Math.max(0, Math.min(1, amount));
  return { rain: NEAR_RAIN_MIX + (1 - proximity) * (1 - NEAR_RAIN_MIX), fire: proximity * MAX_FIREPLACE_MIX };
}

export function createRainPhrase(random = Math.random) {
  return {
    seconds: 8 + random() * 4,
    bodyGain: 0.60 + random() * 0.06,
    bodyHz: 3800 + random() * 600,
    bodyRate: (1.15 + random() * 0.06) * RAIN_PLAYBACK_MULTIPLIER,
    patterGain: 0.24 + random() * 0.04,
    patterHz: 3400 + random() * 600,
    patterRate: (1.24 + random() * 0.08) * RAIN_PLAYBACK_MULTIPLIER,
  };
}

export function seamlessRainBuffer(context, buffer) {
  const overlap = Math.min(Math.round(buffer.sampleRate * 2), Math.floor(buffer.length / 4));
  if (overlap < 2 || buffer.duration < 5) throw new Error("The rain recording is too short to loop.");
  const length = buffer.length - overlap;
  const loop = context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const input = buffer.getChannelData(channel);
    const output = loop.getChannelData(channel);
    output.set(input.subarray(0, length));
    for (let sample = 0; sample < overlap; sample++) {
      const progress = sample / (overlap - 1);
      output[sample] = input[length + sample] * Math.cos(progress * Math.PI / 2) +
        input[sample] * Math.sin(progress * Math.PI / 2);
    }
  }
  return loop;
}

export function createRainAudio({
  AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext,
  fetch: request = globalThis.fetch,
  random = Math.random,
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (id) => globalThis.clearTimeout(id),
} = {}) {
  if (!AudioContext) throw new Error("This browser doesn't support the rain soundscape.");
  const context = new AudioContext();
  const shelterFilter = context.createBiquadFilter();
  const master = context.createGain();
  shelterFilter.type = "lowpass";
  shelterFilter.frequency.value = 4800;
  master.gain.value = 0;
  shelterFilter.connect(master).connect(context.destination);
  const rainMix = context.createGain();
  const fireMix = context.createGain();
  rainMix.gain.value = 1;
  fireMix.gain.value = 0;
  rainMix.connect(shelterFilter);
  fireMix.connect(master);

  function makeNoise(seconds) {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
    return buffer;
  }

  const bodyNoise = makeNoise(8.3);
  function layer(buffer, frequency, rate, output = rainMix) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.4;
    gain.gain.value = 0;
    source.playbackRate.value = rate;
    source.connect(filter).connect(gain).connect(output);
    source.start(0, random() * buffer.duration);
    return { source, filter, gain };
  }
  let layers = null;
  let loading = null;
  function loadRecordings() {
    if (layers) return Promise.resolve();
    loading ??= Promise.all([...RAIN_RECORDINGS, FIREPLACE_RECORDING].map(async (url) => {
      const response = await request(url, { signal: AbortSignal.timeout(20000), credentials: "omit" });
      if (!response.ok) throw new Error(`Couldn't load the sound recording (${response.status}). Try the sound button again.`);
      return seamlessRainBuffer(context, await context.decodeAudioData(await response.arrayBuffer()));
    })).then(([garden, forest, fireplace]) => {
      const body = layer(garden, 4200, 1.18 * RAIN_PLAYBACK_MULTIPLIER);
      const patter = layer(forest, 3700, 1.28 * RAIN_PLAYBACK_MULTIPLIER);
      const fire = layer(fireplace, 3500, 1, fireMix);
      fire.gain.gain.value = 0.7;
      layers = [body, patter, fire];
    }).finally(() => { loading = null; });
    return loading;
  }
  const voices = new Set();
  let phraseTimer = null;
  let playing = false;
  let action = 0;
  let shelterAmount = 0;
  let appliedShelter = -1;
  let fireplaceAmount = 0;
  let appliedFireplace = -1;
  let recentEffects = [];
  const lastEffect = new Map();
  let lastEffectAt = -Infinity;

  function clearPhrase() {
    if (phraseTimer !== null) clearTimer(phraseTimer);
    phraseTimer = null;
  }

  function stopVoices() {
    for (const voice of [...voices]) voice.stop();
  }

  function drip(note, at) {
    if (voices.size >= MAX_RAIN_VOICES) voices.values().next().value.stop();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const splash = context.createBufferSource();
    const splashGain = context.createGain();
    const pan = context.createStereoPanner();
    const end = at + note.duration;
    oscillator.type = note.wave ?? "sine";
    oscillator.frequency.setValueAtTime(note.pitch, at);
    oscillator.frequency.exponentialRampToValueAtTime(note.middlePitch ?? note.pitch * 0.45, at + Math.min(0.05, note.duration * 0.55));
    oscillator.frequency.exponentialRampToValueAtTime(note.endPitch ?? note.pitch * 0.32, end);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(note.volume, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    pan.pan.setValueAtTime(note.pan, at);
    oscillator.connect(gain).connect(pan);
    splash.buffer = bodyNoise;
    const noiseDuration = note.noiseDuration ?? 0.03;
    const noiseVolume = note.volume * (note.noiseVolume ?? 0.25);
    splashGain.gain.setValueAtTime(note.noiseAttack ? 0 : noiseVolume, at);
    if (note.noiseAttack) splashGain.gain.linearRampToValueAtTime(noiseVolume, at + note.noiseAttack);
    splashGain.gain.exponentialRampToValueAtTime(0.0001, at + noiseDuration * 0.95);
    splash.connect(splashGain).connect(pan);
    pan.connect(shelterFilter);
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      for (const node of [oscillator, gain, splash, splashGain, pan]) node.disconnect();
      voices.delete(voice);
    };
    const voice = {
      stop() {
        oscillator.stop(context.currentTime);
        splash.stop(context.currentTime);
        dispose();
      },
    };
    voices.add(voice);
    oscillator.onended = dispose;
    oscillator.start(at);
    oscillator.stop(end + 0.02);
    splash.start(at, note.grain, noiseDuration);
  }

  function ramp(parameter, target, seconds) {
    const now = context.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setValueAtTime(parameter.value, now);
    parameter.linearRampToValueAtTime(target, now + seconds);
  }

  function schedulePhrase(first = false) {
    if (!playing) return;
    const phrase = createRainPhrase(random);
    const transition = first ? 0.8 : phrase.seconds * 0.75;
    const [body, patter] = layers;
    ramp(body.gain.gain, phrase.bodyGain, transition);
    ramp(body.filter.frequency, phrase.bodyHz, transition);
    ramp(patter.gain.gain, phrase.patterGain, transition);
    ramp(patter.filter.frequency, phrase.patterHz, transition);
    ramp(body.source.playbackRate, phrase.bodyRate, transition);
    ramp(patter.source.playbackRate, phrase.patterRate, transition);
    phraseTimer = setTimer(() => {
      phraseTimer = null;
      schedulePhrase();
    }, phrase.seconds * 1000);
  }

  function applyShelter() {
    if (!playing || Math.abs(shelterAmount - appliedShelter) < 0.04 && Math.abs(fireplaceAmount - appliedFireplace) < 0.02) return;
    appliedShelter = shelterAmount;
    appliedFireplace = fireplaceAmount;
    shelterFilter.frequency.setTargetAtTime(4800 - shelterAmount * 2600, context.currentTime, 0.3);
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(0.62 * (1 - shelterAmount * 0.25), context.currentTime, 0.3);
    const mix = fireplaceMix(fireplaceAmount);
    rainMix.gain.setTargetAtTime(mix.rain, context.currentTime, 0.4);
    fireMix.gain.setTargetAtTime(mix.fire, context.currentTime, 0.4);
  }

  return {
    async play() {
      const currentAction = ++action;
      try {
        await Promise.all([context.resume(), loadRecordings()]);
      } catch (error) {
        if (currentAction !== action) return;
        playing = false;
        clearPhrase();
        await context.suspend();
        throw new Error(`Couldn't start the soundscape: ${error.message}`);
      }
      if (currentAction !== action) return;
      if (context.state !== "running") throw new Error("Your browser paused the audio. Try the sound button again.");
      playing = true;
      clearPhrase();
      stopVoices();
      recentEffects = [];
      lastEffect.clear();
      lastEffectAt = -Infinity;
      appliedShelter = -1;
      appliedFireplace = -1;
      applyShelter();
      schedulePhrase(true);
    },
    async pause() {
      const currentAction = ++action;
      playing = false;
      clearPhrase();
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(0, context.currentTime, 0.035);
      await new Promise((resolve) => setTimer(resolve, 160));
      if (currentAction === action) {
        stopVoices();
        await context.suspend();
      }
    },
    shelter(amount) {
      shelterAmount = Math.max(0, Math.min(1, amount));
      applyShelter();
    },
    fireplace(amount) {
      fireplaceMix(amount);
      fireplaceAmount = Math.max(0, Math.min(1, amount));
      applyShelter();
    },
    effect(kind) {
      if (!Object.hasOwn(INTERACTION_SOUNDS, kind)) throw new RangeError(`Unknown interaction sound: ${kind}`);
      const notes = INTERACTION_SOUNDS[kind];
      if (!playing || context.state !== "running") return false;
      const now = context.currentTime;
      recentEffects = recentEffects.filter((time) => now - time < 1);
      if (now - lastEffectAt < 0.045 || now - (lastEffect.get(kind) ?? -Infinity) < 0.085 || recentEffects.length >= 6) return false;
      for (const note of notes) drip({ ...note, pan: 0, grain: random() * 4 }, now + note.at);
      lastEffect.set(kind, now);
      lastEffectAt = now;
      recentEffects.push(now);
      return true;
    },
  };
}
import { INTERACTION_SOUNDS } from "./interaction-sounds.js";
