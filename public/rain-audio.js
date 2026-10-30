export const MAX_RAIN_VOICES = 24;

export function createRainPhrase(random = Math.random) {
  const seconds = 6 + random() * 4;
  const drips = [];
  const bursts = 2 + Math.floor(random() * 3);
  for (let burst = 0; burst < bursts; burst++) {
    let at = 0.4 + random() * (seconds - 1.6);
    const taps = burst === 0 ? 2 : random() < 0.25 ? 3 : random() < 0.65 ? 2 : 1;
    const volume = 0.018 + random() * 0.012;
    const pan = random() * 0.7 - 0.35;
    for (let tap = 0; tap < taps; tap++) {
      drips.push({
        at,
        pitch: 950 + random() * 1500,
        volume: volume * (tap ? 0.6 + random() * 0.3 : 1),
        duration: 0.09 + random() * 0.12,
        pan,
        grain: random() * 4,
      });
      at += 0.13 + random() * 0.18;
    }
  }
  return {
    seconds,
    bodyGain: 0.09 + random() * 0.055,
    bodyHz: 850 + random() * 900,
    patterGain: 0.025 + random() * 0.035,
    patterHz: 2300 + random() * 2100,
    drips: drips.sort((a, b) => a.at - b.at),
  };
}

export function createRainAudio({
  AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext,
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

  function makeNoise(seconds) {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
    return buffer;
  }

  const bodyNoise = makeNoise(8.3);
  function layer(buffer, type, frequency) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.4;
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(shelterFilter);
    source.start();
    return { source, filter, gain };
  }
  const body = layer(bodyNoise, "lowpass", 1200);
  const patter = layer(makeNoise(11.7), "bandpass", 3000);
  const voices = new Set();
  let phraseTimer = null;
  let playing = false;
  let action = 0;
  let shelterAmount = 0;
  let appliedShelter = -1;
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
    ramp(body.gain.gain, phrase.bodyGain, transition);
    ramp(body.filter.frequency, phrase.bodyHz, transition);
    ramp(patter.gain.gain, phrase.patterGain, transition);
    ramp(patter.filter.frequency, phrase.patterHz, transition);
    for (const note of phrase.drips) drip(note, context.currentTime + 0.05 + note.at);
    phraseTimer = setTimer(() => {
      phraseTimer = null;
      schedulePhrase();
    }, phrase.seconds * 1000);
  }

  function applyShelter() {
    if (!playing || Math.abs(shelterAmount - appliedShelter) < 0.04) return;
    appliedShelter = shelterAmount;
    shelterFilter.frequency.setTargetAtTime(4800 - shelterAmount * 2600, context.currentTime, 0.3);
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(0.62 * (1 - shelterAmount * 0.25), context.currentTime, 0.3);
  }

  return {
    async play() {
      const currentAction = ++action;
      await context.resume();
      if (currentAction !== action) return;
      if (context.state !== "running") throw new Error("Your browser paused the audio. Try the sound button again.");
      playing = true;
      clearPhrase();
      stopVoices();
      recentEffects = [];
      lastEffect.clear();
      lastEffectAt = -Infinity;
      appliedShelter = -1;
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
