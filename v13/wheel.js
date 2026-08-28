import {
    PROMPT_KEY, advanceProgress, clampNumber, clampWeight, esc, extension_prompt_types,
    getActiveLevel, getActivePresetName, getContext, getState, hideResultFor, hideWheelFor,
    markRemoved, normalizeVisibility, persist, selectPreset, sourceLabel,
} from './state.js';
import { resolveEntries } from './lorebook.js';
import {
    playResultSound, playSpinStart, startSpinHum, trackPointerTicks, unlockAudio,
} from './audio.js';

let overlay = null;
let canvas = null;
let ctx2d = null;
let currentEntries = [];
let currentRotation = 0;
let spinning = false;
let spunThisOpen = false;
let promptTimeout = null;

export function isSpinning() { return spinning; }

function customColors() {
    return String(getState().segmentColors || '').split(',').map(x => x.trim()).filter(Boolean);
}

function palette(index, total) {
    const s = getState();
    const themes = {
        classic: ['#d7263d', '#f49d37', '#f9dc5c', '#3bb273', '#2b9eb3', '#4d7cff', '#7b5cff', '#c149d8'],
        pastel: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'],
        ocean: ['#023e8a', '#0077b6', '#0096c7', '#00b4d8', '#48cae4', '#90e0ef', '#4ea8de', '#5390d9'],
        fire: ['#7f0000', '#b71c1c', '#e65100', '#ef6c00', '#f9a825', '#fdd835', '#ff7043', '#c62828'],
        mono: ['#20242e', '#343b49', '#495264', '#5f6a7d', '#737f94', '#8a96ab', '#a4afc0', '#c2cad6'],
    };
    if (s.wheelTheme === 'custom') {
        const colors = customColors();
        if (colors.length) return colors[index % colors.length];
    }
    if (themes[s.wheelTheme]) return themes[s.wheelTheme][index % themes[s.wheelTheme].length];
    return `hsl(${(265 + index * (300 / Math.max(total, 1))) % 360} 72% ${index % 2 ? 53 : 60}%)`;
}

function fitLabel(text, max = 23) {
    const clean = String(text).trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function applyAppearance() {
    const s = getState();
    const root = overlay || document.getElementById('wof-overlay');
    if (root) {
        root.style.setProperty('--wof-accent', s.accentColor || '#7b54ff');
        root.style.setProperty('--wof-pointer', s.pointerColor || '#fff3b0');
        root.style.setProperty('--wof-text', s.textColor || '#ffffff');
    }
    document.querySelector('#wof-overlay .wof-wheel-wrap')?.style.setProperty('--wof-wheel-size', `${clampNumber(s.wheelSize, 300, 760, 520)}px`);
    const title = document.getElementById('wof-overlay-title');
    if (title) title.textContent = s.wheelTitle || 'Wheel of Fortune';
    syncFloatingButton();
}

export function drawWheel(entries, concealLabels = false) {
    if (!ctx2d || !canvas) return;
    const s = getState();
    const rect = canvas.getBoundingClientRect();
    const cssSize = Math.max(280, Math.floor(rect.width || clampNumber(s.wheelSize, 300, 760, 520)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.max(420, Math.floor(cssSize * dpr));
    if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; }

    const c = size / 2;
    const radius = c - 10;
    ctx2d.clearRect(0, 0, size, size);
    const total = entries.reduce((sum, e) => sum + clampWeight(e.weight), 0) || 1;
    let angle = -Math.PI / 2;

    entries.forEach((entry, index) => {
        const weight = clampWeight(entry.weight);
        const slice = weight / total * Math.PI * 2;
        ctx2d.beginPath();
        ctx2d.moveTo(c, c);
        ctx2d.arc(c, c, radius, angle, angle + slice);
        ctx2d.closePath();
        ctx2d.fillStyle = palette(index, entries.length);
        ctx2d.fill();
        ctx2d.strokeStyle = 'rgba(255,255,255,.42)';
        ctx2d.lineWidth = Math.max(2, size / 250);
        ctx2d.stroke();

        const middle = angle + slice / 2;
        ctx2d.save();
        ctx2d.translate(c, c);
        ctx2d.rotate(middle);
        ctx2d.textAlign = 'right';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillStyle = s.textColor || '#fff';
        ctx2d.shadowColor = 'rgba(0,0,0,.62)';
        ctx2d.shadowBlur = 5;
        ctx2d.font = `700 ${Math.max(12, size / 35)}px system-ui, sans-serif`;
        const pct = Math.round(weight / total * 100);
        const label = concealLabels ? '???' : `${fitLabel(entry.title)}${s.showWeights ? ` · ${pct}%` : ''}`;
        ctx2d.fillText(label, radius * .9, 0);
        ctx2d.restore();
        angle += slice;
    });

    ctx2d.beginPath();
    ctx2d.arc(c, c, radius, 0, Math.PI * 2);
    ctx2d.strokeStyle = 'rgba(255,255,255,.82)';
    ctx2d.lineWidth = Math.max(5, size / 85);
    ctx2d.stroke();
}

function segmentCenterDegrees(entries, chosenIndex) {
    const total = entries.reduce((sum, e) => sum + clampWeight(e.weight), 0);
    let start = -90;
    for (let i = 0; i < entries.length; i++) {
        const degrees = clampWeight(entries[i].weight) / total * 360;
        if (i === chosenIndex) return start + degrees / 2;
        start += degrees;
    }
    return -90;
}

function calculateRotation(entries, index) {
    const s = getState();
    const centerDeg = segmentCenterDegrees(entries, index);
    const normalizedCurrent = ((currentRotation % 360) + 360) % 360;
    const targetMod = ((-90 - centerDeg) % 360 + 360) % 360;
    let delta = ((targetMod - normalizedCurrent) % 360 + 360) % 360;
    let direction = s.spinDirection;
    if (direction === 'random') direction = Math.random() < 0.5 ? 'clockwise' : 'counterclockwise';
    const turns = 11 + Math.floor(Math.random() * 6);
    if (direction === 'counterclockwise') {
        if (delta !== 0) delta -= 360;
        return currentRotation - 360 * turns + delta;
    }
    return currentRotation + 360 * turns + delta;
}

function weightedPick(entries) {
    const total = entries.reduce((sum, e) => sum + clampWeight(e.weight), 0);
    let cursor = Math.random() * total;
    for (let i = 0; i < entries.length; i++) {
        cursor -= clampWeight(entries[i].weight);
        if (cursor <= 0) return { entry: entries[i], index: i };
    }
    return { entry: entries.at(-1), index: entries.length - 1 };
}

function activateRequestedPreset(options = {}) {
    if (!options.preset) return true;
    const preset = selectPreset(options.preset);
    if (!preset) {
        toastr.error(`Wheel preset “${options.preset}” does not exist.`, 'Wheel of Fortune');
        return false;
    }
    return true;
}

export function buildOverlay() {
    if (document.getElementById('wof-overlay')) {
        overlay = document.getElementById('wof-overlay');
        canvas = document.getElementById('wof-canvas');
        ctx2d = canvas?.getContext('2d');
        applyAppearance();
        return;
    }

    document.body.insertAdjacentHTML('beforeend', `
      <div id="wof-overlay" class="wof-overlay" aria-hidden="true">
        <div class="wof-shell">
          <div class="wof-topbar">
            <div class="wof-brand"><div class="wof-brand-icon">🎡</div><div><div class="wof-title" id="wof-overlay-title">Wheel of Fortune</div><div class="wof-subtitle" id="wof-source-label">Weighted roleplay forfeits</div></div></div>
            <div class="wof-level-badge" id="wof-level-badge">Level 1</div>
            <button id="wof-close" class="wof-close" title="Close">✕</button>
          </div>
          <div id="wof-stage" class="wof-stage"><div class="wof-wheel-wrap"><div class="wof-pointer"></div><canvas id="wof-canvas" class="wof-canvas"></canvas><button id="wof-center" class="wof-center" type="button"><b>SPIN</b><span>the wheel</span></button></div></div>
          <div id="wof-suspense" class="wof-suspense">The wheel has stopped…</div>
          <div id="wof-result" class="wof-result"><div class="wof-result-label">The wheel chose</div><div id="wof-result-title" class="wof-result-title"></div><div id="wof-result-body" class="wof-result-body"></div></div>
          <div class="wof-actions"><button id="wof-close-bottom" class="wof-action">Close</button></div>
          <details class="wof-history"><summary>Recent spins</summary><div id="wof-history-list" class="wof-history-list"></div></details>
        </div>
      </div>`);

    overlay = document.getElementById('wof-overlay');
    canvas = document.getElementById('wof-canvas');
    ctx2d = canvas?.getContext('2d');
    document.getElementById('wof-close')?.addEventListener('click', closeWheel);
    document.getElementById('wof-close-bottom')?.addEventListener('click', closeWheel);
    document.getElementById('wof-center')?.addEventListener('click', () => spinWheel());
    overlay?.addEventListener('click', e => { if (e.target === overlay && !spinning) closeWheel(); });
    window.addEventListener('resize', () => drawWheel(currentEntries, hideWheelFor(getState().visibilityMode)));
    applyAppearance();
}

export function syncFloatingButton() {
    const s = getState();
    let button = document.getElementById('wof-floating-button');
    if (s.floatingButton) {
        if (!button) {
            button = document.createElement('button');
            button.id = 'wof-floating-button';
            button.type = 'button';
            button.className = 'wof-floating-button';
            button.title = 'Open Wheel of Fortune';
            button.innerHTML = '🎡';
            button.addEventListener('click', () => openWheel());
            document.body.appendChild(button);
        }
        button.style.setProperty('--wof-accent', s.accentColor || '#7b54ff');
    } else button?.remove();
}

function renderHistory() {
    const host = document.getElementById('wof-history-list');
    if (!host) return;
    host.innerHTML = getState().history.slice(0, 10).map(h => {
        const title = h.secret ? '🤫 Hidden result' : esc(h.title);
        const preset = h.preset ? `<b>${esc(h.preset)}</b> · ` : '';
        return `<div class="wof-history-item"><span>${preset}${title}</span><span>${esc(h.time)}</span></div>`;
    }).join('') || '<div>No spins yet.</div>';
}

export async function openWheel(options = {}) {
    if (!activateRequestedPreset(options)) return false;
    const s = getState();
    buildOverlay();
    applyAppearance();
    const visibility = normalizeVisibility(options.visibility ?? s.visibilityMode);
    const level = getActiveLevel(options.level);
    currentEntries = await resolveEntries({ level, sourceOverride: options.sourceOverride });
    if (!currentEntries.length) {
        toastr.warning(`No valid forfeits at level ${level}. Run “Validate / preview Lorebook”.`, 'Wheel of Fortune');
        return false;
    }

    spunThisOpen = false;
    const center = document.getElementById('wof-center');
    center?.classList.remove('wof-disabled');
    if (center) center.innerHTML = '<b>SPIN</b><span>the wheel</span>';

    overlay.dataset.visibility = visibility;
    overlay.classList.toggle('wof-hidden-wheel', hideWheelFor(visibility));
    overlay.classList.toggle('wof-hidden-result', hideResultFor(visibility));
    overlay.classList.add('wof-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('wof-result')?.classList.remove('wof-show', 'wof-result-secret');
    document.getElementById('wof-suspense')?.classList.remove('wof-show');
    const source = document.getElementById('wof-source-label');
    const effectiveSourceLabel = options.sourceOverride === 'character' ? 'Active character Lorebook · auto-detected' : sourceLabel();
    if (source) source.textContent = `${effectiveSourceLabel} · ${currentEntries.length} eligible${currentEntries.some(e => e.cooldownSafetyRelease) ? ' · cooldown safety release' : ''}`;
    const badge = document.getElementById('wof-level-badge');
    if (badge) badge.textContent = `Level ${level}`;
    drawWheel(currentEntries, hideWheelFor(visibility));
    renderHistory();
    return true;
}

export function closeWheel() {
    if (!overlay || spinning) return;
    overlay.classList.remove('wof-open');
    overlay.setAttribute('aria-hidden', 'true');
}

function clearInjectedPrompt() {
    try { getContext().setExtensionPrompt(PROMPT_KEY, '', extension_prompt_types.NONE, 0); }
    catch (error) { console.warn('[Wheel of Fortune] Could not clear result prompt', error); }
}

export { clearInjectedPrompt };

async function deliverResult(entry, requestedMode, visibility) {
    const s = getState();
    const c = getContext();
    const secret = hideResultFor(visibility);
    let mode = requestedMode || s.resultMode;
    if (secret) mode = s.secretResultToCharacter ? 'prompt' : 'private';

    if (mode === 'system') {
        c.sendSystemMessage('generic', `🎡 ${s.wheelTitle || 'Wheel of Fortune'} — ${entry.title}${entry.description ? `\n${entry.description}` : ''}`, { wof_result: true, wof_preset: getActivePresetName() });
        await c.saveChat?.();
    } else if (mode === 'prompt') {
        c.setExtensionPrompt(
            PROMPT_KEY,
            `A Wheel of Fortune spin from preset "${getActivePresetName()}" selected the following authoritative roleplay forfeit. Continue the roleplay from this outcome. Do not narrate extension internals or reveal hidden wheel information unless explicitly permitted. Do not immediately trigger another wheel unless the scene genuinely calls for a separate later spin:\n\n${entry.title}\n${entry.description}`,
            extension_prompt_types.IN_CHAT,
            0,
        );
        clearTimeout(promptTimeout);
        promptTimeout = setTimeout(clearInjectedPrompt, 180000);
        if (!secret) toastr.success('Result injected into the next character generation.', 'Wheel of Fortune');
    } else if (!secret) {
        toastr.info('Result kept in the wheel UI only.', 'Wheel of Fortune');
    }
}

export async function spinWheel(options = {}) {
    if (spinning || spunThisOpen) return '';
    if (!activateRequestedPreset(options)) return '';
    const s = getState();
    const visibility = normalizeVisibility(options.visibility ?? (options.hidden === true ? 'hidden-wheel' : s.visibilityMode));
    const level = getActiveLevel(options.level);
    const opened = overlay?.classList.contains('wof-open') || await openWheel({ ...options, preset: undefined, visibility, level });
    if (!opened) return '';

    currentEntries = await resolveEntries({ level, sourceOverride: options.sourceOverride });
    if (!currentEntries.length) return '';
    spunThisOpen = true;
    spinning = true;
    const center = document.getElementById('wof-center');
    const resultBox = document.getElementById('wof-result');
    const suspense = document.getElementById('wof-suspense');
    center?.classList.add('wof-disabled');
    resultBox?.classList.remove('wof-show', 'wof-result-secret');
    suspense?.classList.remove('wof-show');
    overlay.classList.toggle('wof-hidden-wheel', hideWheelFor(visibility));
    overlay.classList.toggle('wof-hidden-result', hideResultFor(visibility));
    drawWheel(currentEntries, hideWheelFor(visibility));

    const { entry, index } = weightedPick(currentEntries);
    currentRotation = calculateRotation(currentEntries, index);
    const seconds = clampNumber(options.seconds ?? s.spinSeconds, 4, 30, 10.5);

    await unlockAudio();
    playSpinStart();
    const stopHum = startSpinHum(seconds);
    const stopTicks = trackPointerTicks(canvas, currentEntries, seconds);

    canvas.style.transition = `transform ${seconds}s cubic-bezier(.06,.68,.05,1)`;
    requestAnimationFrame(() => { canvas.style.transform = `rotate(${currentRotation}deg)`; });
    await new Promise(resolve => setTimeout(resolve, seconds * 1000 + 100));
    stopTicks();
    stopHum();

    suspense?.classList.add('wof-show');
    const revealDelay = clampNumber(options.revealDelay ?? s.revealDelay, 0, 5, 1.4);
    if (revealDelay) await new Promise(resolve => setTimeout(resolve, revealDelay * 1000));
    suspense?.classList.remove('wof-show');
    spinning = false;
    if (center) center.innerHTML = '<b>DONE</b><span>result chosen</span>';

    const secret = hideResultFor(visibility);
    playResultSound({ secret });
    const title = document.getElementById('wof-result-title');
    const body = document.getElementById('wof-result-body');
    if (secret) {
        if (title) title.textContent = '🤫 Result hidden';
        if (body) body.textContent = s.secretResultToCharacter ? 'The selected forfeit was sent privately to the character/AI.' : 'The selected forfeit remains private and was not sent to the character.';
        resultBox?.classList.add('wof-result-secret');
    } else {
        if (title) title.textContent = entry.title;
        if (body) body.textContent = entry.description || '';
    }
    resultBox?.classList.add('wof-show');

    s.history.unshift({ title: entry.title, time: new Date().toLocaleString(), source: options.sourceOverride || s.source, preset: getActivePresetName(), level, secret });
    s.history = s.history.slice(0, 30);
    if (s.removeOnce && entry.once) markRemoved(entry.sourceId);
    advanceProgress(entry);
    persist();
    renderHistory();
    await deliverResult(entry, options.result || options.mode || s.resultMode, visibility);
    if (s.autoClose) setTimeout(closeWheel, 1600);
    return secret ? '[hidden result]' : entry.title;
}
