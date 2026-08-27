import { clampNumber, getState } from './state.js';

let audioContext = null;
let unlockInstalled = false;
let activeSpinNodes = [];

function getAudioContext() {
    if (audioContext) return audioContext;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try { audioContext = new Ctx(); } catch { audioContext = null; }
    return audioContext;
}

export async function unlockAudio() {
    const ctx = getAudioContext();
    if (!ctx) return false;
    try {
        if (ctx.state === 'suspended') await ctx.resume();
        return ctx.state === 'running';
    } catch { return false; }
}

export function installAudioUnlock() {
    if (unlockInstalled) return;
    unlockInstalled = true;
    const unlock = () => { unlockAudio(); };
    document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    document.addEventListener('keydown', unlock, { capture: true });
}

function masterGain(multiplier = 1) {
    const s = getState();
    return clampNumber(s.audioVolume, 0, 1, 0.35) * multiplier;
}

function pulsePointer() {
    const pointer = document.querySelector('#wof-overlay .wof-pointer');
    if (!pointer) return;
    pointer.classList.remove('wof-pointer-tick');
    void pointer.offsetWidth;
    pointer.classList.add('wof-pointer-tick');
}

function oscillatorPulse({ frequency = 900, duration = 0.025, gain = 0.08, type = 'square', endFrequency = null } = {}) {
    const s = getState();
    if (!s.audioEnabled) return;
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    amp.gain.setValueAtTime(Math.max(0.0001, masterGain(gain)), now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
}

function noiseBurst({ duration = 0.035, gain = 0.05, filterFrequency = 1800 } = {}) {
    const s = getState();
    if (!s.audioEnabled) return;
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') return;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFrequency;
    filter.Q.value = 2.5;
    const amp = ctx.createGain();
    amp.gain.value = masterGain(gain);
    source.connect(filter).connect(amp).connect(ctx.destination);
    source.start();
}

export function playPointerTick(strength = 1) {
    const s = getState();
    if (!s.audioEnabled || !s.pointerTicks) return;
    const volume = clampNumber(s.tickVolume, 0, 1, 0.75) * clampNumber(strength, 0.25, 1.25, 1);
    pulsePointer();
    if (s.tickStyle === 'soft') {
        oscillatorPulse({ frequency: 620, endFrequency: 480, duration: 0.028, gain: 0.07 * volume, type: 'sine' });
    } else if (s.tickStyle === 'wooden') {
        noiseBurst({ duration: 0.026, gain: 0.09 * volume, filterFrequency: 1150 });
        oscillatorPulse({ frequency: 330, endFrequency: 250, duration: 0.022, gain: 0.045 * volume, type: 'triangle' });
    } else {
        oscillatorPulse({ frequency: 1180, endFrequency: 760, duration: 0.022, gain: 0.065 * volume, type: 'square' });
    }
}

export function playSpinStart() {
    const s = getState();
    if (!s.audioEnabled || !s.spinSound) return;
    oscillatorPulse({ frequency: 150, endFrequency: 520, duration: 0.22, gain: 0.11, type: 'sawtooth' });
    noiseBurst({ duration: 0.16, gain: 0.035, filterFrequency: 900 });
}

export function startSpinHum(seconds = 10) {
    const s = getState();
    if (!s.audioEnabled || !s.spinSound) return () => {};
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') return () => {};
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(72, now);
    osc.frequency.linearRampToValueAtTime(105, now + Math.min(1.4, seconds * .2));
    osc.frequency.linearRampToValueAtTime(52, now + seconds);
    filter.type = 'lowpass';
    filter.frequency.value = 360;
    amp.gain.setValueAtTime(masterGain(0.022), now);
    amp.gain.setValueAtTime(masterGain(0.022), now + Math.max(0, seconds - 1.2));
    amp.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    osc.connect(filter).connect(amp).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + seconds + .05);
    activeSpinNodes.push(osc);
    return () => {
        try { amp.gain.cancelScheduledValues(ctx.currentTime); amp.gain.setTargetAtTime(0.0001, ctx.currentTime, .025); } catch { /* noop */ }
    };
}

export function playResultSound({ secret = false } = {}) {
    const s = getState();
    if (!s.audioEnabled || !s.resultSound) return;
    if (secret) {
        oscillatorPulse({ frequency: 440, endFrequency: 330, duration: 0.12, gain: 0.08, type: 'triangle' });
        setTimeout(() => oscillatorPulse({ frequency: 300, endFrequency: 220, duration: 0.14, gain: 0.07, type: 'triangle' }), 80);
        return;
    }
    oscillatorPulse({ frequency: 523.25, duration: 0.22, gain: 0.075, type: 'sine' });
    setTimeout(() => oscillatorPulse({ frequency: 659.25, duration: 0.24, gain: 0.075, type: 'sine' }), 80);
    setTimeout(() => oscillatorPulse({ frequency: 783.99, duration: 0.3, gain: 0.085, type: 'sine' }), 160);
}

function rotationDegrees(element) {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === 'none') return 0;
    const match = transform.match(/^matrix\(([^)]+)\)$/);
    if (match) {
        const parts = match[1].split(',').map(Number);
        return Math.atan2(parts[1], parts[0]) * 180 / Math.PI;
    }
    const match3d = transform.match(/^matrix3d\(([^)]+)\)$/);
    if (match3d) {
        const parts = match3d[1].split(',').map(Number);
        return Math.atan2(parts[1], parts[0]) * 180 / Math.PI;
    }
    return 0;
}

function segmentAtPointer(entries, rotationDeg) {
    const total = entries.reduce((sum, e) => sum + Math.max(0.0001, Number(e.weight) || 1), 0);
    const normalized = ((-rotationDeg % 360) + 360) % 360;
    const target = normalized / 360 * total;
    let cursor = 0;
    for (let i = 0; i < entries.length; i++) {
        cursor += Math.max(0.0001, Number(entries[i].weight) || 1);
        if (target < cursor) return i;
    }
    return Math.max(0, entries.length - 1);
}

export function trackPointerTicks(canvas, entries, seconds) {
    const s = getState();
    if (!s.audioEnabled || !s.pointerTicks || !canvas || !entries?.length) return () => {};
    let stopped = false;
    let raf = 0;
    let previous = segmentAtPointer(entries, rotationDegrees(canvas));
    let previousAngle = rotationDegrees(canvas);
    let lastTickAt = 0;
    const started = performance.now();
    const durationMs = Math.max(1, Number(seconds) * 1000);

    const frame = now => {
        if (stopped) return;
        const angle = rotationDegrees(canvas);
        const segment = segmentAtPointer(entries, angle);
        if (segment !== previous && now - lastTickAt > 18) {
            const rawDelta = Math.abs(angle - previousAngle);
            const speedStrength = clampNumber(rawDelta / 10, .35, 1.1, .7);
            playPointerTick(speedStrength);
            lastTickAt = now;
            previous = segment;
        }
        previousAngle = angle;
        if (now - started < durationMs + 250) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { stopped = true; if (raf) cancelAnimationFrame(raf); };
}

export async function testAudio() {
    const ok = await unlockAudio();
    if (!ok) return false;
    playPointerTick(1);
    setTimeout(() => playResultSound({ secret: false }), 160);
    return true;
}

export function stopAllAudio() {
    for (const node of activeSpinNodes.splice(0)) {
        try { node.stop(); } catch { /* already stopped */ }
    }
}
