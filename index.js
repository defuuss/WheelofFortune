import { eventSource, event_types, extension_prompt_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';

const MODULE = 'wheel-of-fortune';
const PROMPT_KEY = 'WHEEL_OF_FORTUNE_RESULT';
const TRIGGER_PROMPT_KEY = 'WHEEL_OF_FORTUNE_TRIGGER';

function makeId() {
    try {
        if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    } catch {
        // randomUUID may be unavailable on non-secure HTTP origins.
    }
    return `wof-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const defaults = {
    triggerEnabled: true,
    triggerToken: '[[SPIN_WHEEL]]',
    triggerUser: false,
    characterHint: true,
    resultMode: 'system',
    hiddenSpin: false,
    autoClose: false,
    source: 'manual',
    lorebook: '',
    lorebookMode: 'tagged',
    removeOnce: true,
    spinSeconds: 5.5,

    // Appearance
    wheelTitle: 'Wheel of Fortune',
    wheelTheme: 'neon',
    wheelSize: 520,
    accentColor: '#7b54ff',
    pointerColor: '#fff3b0',
    textColor: '#ffffff',
    segmentColors: '#7c4dff, #e449d6, #ff5c8a, #ff9854, #ffd166, #52d6a8, #39b9ff, #5965ff',
    showWeights: false,
    floatingButton: true,
    spinDirection: 'clockwise',

    entries: [
        { id: makeId(), title: 'Tell an embarrassing secret', description: 'The selected character must reveal an embarrassing but believable secret.', weight: 3, once: false },
        { id: makeId(), title: 'Truth or dare', description: 'The selected character must choose truth or dare and follow through.', weight: 3, once: false },
        { id: makeId(), title: 'Unexpected confession', description: 'A character makes an unexpected confession that changes the mood of the scene.', weight: 2, once: false },
        { id: makeId(), title: 'Role reversal', description: 'For the next scene beat, reverse the usual social roles or power dynamic.', weight: 2, once: false },
        { id: makeId(), title: 'Wildcard', description: 'Invent a surprising but story-compatible forfeit appropriate to the current scene.', weight: 1, once: false },
        { id: makeId(), title: 'Lucky escape', description: 'No forfeit this time. The character gets away with it.', weight: 1, once: false },
    ],
    removedIds: [],
    history: [],
};

let state = null;
let overlay = null;
let canvas = null;
let ctx2d = null;
let currentEntries = [];
let currentRotation = 0;
let spinning = false;
let lastTriggerFingerprint = '';
let promptTimeout = null;
let commandsRegistered = false;

function ensureSettings() {
    if (!extension_settings[MODULE]) extension_settings[MODULE] = {};
    const saved = extension_settings[MODULE];
    state = Object.assign({}, structuredClone(defaults), saved);
    state.entries = Array.isArray(saved.entries) && saved.entries.length ? saved.entries : structuredClone(defaults.entries);
    state.entries = state.entries.map(entry => ({ ...entry, id: entry.id || makeId() }));
    state.removedIds = Array.isArray(saved.removedIds) ? saved.removedIds : [];
    state.history = Array.isArray(saved.history) ? saved.history : [];
    extension_settings[MODULE] = state;
    saveSettingsDebounced();
    return state;
}

function getState() {
    return state || ensureSettings();
}

function persist() {
    if (!state) return;
    extension_settings[MODULE] = state;
    saveSettingsDebounced();
}

function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function clampWeight(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 1;
}

function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function normalizeManualEntries() {
    const s = getState();
    return s.entries
        .filter(e => e && e.title && !s.removedIds.includes(e.id))
        .map(e => ({ ...e, weight: clampWeight(e.weight), sourceId: e.id }));
}

function parseLorebookMeta(entry) {
    const keys = Array.isArray(entry?.key) ? entry.key.join(' ') : String(entry?.key ?? '');
    const comment = String(entry?.comment ?? '');
    const haystack = `${comment} ${keys}`;
    const weightMatch = haystack.match(/\[weight\s*=\s*([0-9]+(?:\.[0-9]+)?)\]/i);
    return {
        tagged: /\[wheel\]/i.test(haystack),
        once: /\[once\]/i.test(haystack),
        weight: weightMatch ? clampWeight(weightMatch[1]) : 1,
    };
}

async function getLorebookEntries() {
    const s = getState();
    const context = getContext();
    if (!s.lorebook) return [];
    try {
        const book = await context.loadWorldInfo(s.lorebook);
        const values = Object.values(book?.entries ?? {});
        return values
            .filter(entry => entry && !entry.disable)
            .map(entry => {
                const meta = parseLorebookMeta(entry);
                const keys = Array.isArray(entry.key) ? entry.key.filter(Boolean) : [];
                const rawTitle = String(entry.comment || keys[0] || `Lorebook entry ${entry.uid ?? ''}`);
                const title = rawTitle.replace(/\[(?:wheel|once|weight\s*=\s*[^\]]+)\]/gi, '').trim() || 'Untitled forfeit';
                const sourceId = `lorebook:${s.lorebook}:${entry.uid ?? title}`;
                return {
                    id: sourceId,
                    sourceId,
                    title,
                    description: String(entry.content ?? '').trim(),
                    weight: meta.weight,
                    once: meta.once,
                    tagged: meta.tagged,
                };
            })
            .filter(entry => s.lorebookMode === 'all' || entry.tagged)
            .filter(entry => !s.removedIds.includes(entry.sourceId));
    } catch (error) {
        console.error('[Wheel of Fortune] Failed to load Lorebook', error);
        toastr.error(`Could not load Lorebook “${s.lorebook}”.`, 'Wheel of Fortune');
        return [];
    }
}

async function resolveEntries() {
    const s = getState();
    const entries = s.source === 'lorebook' ? await getLorebookEntries() : normalizeManualEntries();
    return entries.filter(e => clampWeight(e.weight) > 0);
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

function customColors() {
    const s = getState();
    return String(s.segmentColors || '')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
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
    const hue = (265 + index * (300 / Math.max(total, 1))) % 360;
    return `hsl(${hue} 72% ${index % 2 ? 53 : 60}%)`;
}

function fitLabel(text, max = 23) {
    const clean = String(text).trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function applyAppearance() {
    const s = getState();
    const root = overlay || document.getElementById('wof-overlay');
    if (root) {
        root.style.setProperty('--wof-accent', s.accentColor || '#7b54ff');
        root.style.setProperty('--wof-pointer', s.pointerColor || '#fff3b0');
        root.style.setProperty('--wof-text', s.textColor || '#ffffff');
    }
    const wrap = document.querySelector('#wof-overlay .wof-wheel-wrap');
    if (wrap) wrap.style.setProperty('--wof-wheel-size', `${clampNumber(s.wheelSize, 300, 760, 520)}px`);
    const title = document.getElementById('wof-overlay-title');
    if (title) title.textContent = s.wheelTitle || 'Wheel of Fortune';
    syncFloatingButton();
}

function drawWheel(entries, concealLabels = false) {
    if (!ctx2d || !canvas) return;
    const s = getState();
    const rect = canvas.getBoundingClientRect();
    const cssSize = Math.max(280, Math.floor(rect.width || clampNumber(s.wheelSize, 300, 760, 520)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.max(420, Math.floor(cssSize * dpr));
    if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
    }
    const c = canvas.width / 2;
    const radius = c - 10;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    const total = entries.reduce((sum, e) => sum + clampWeight(e.weight), 0) || 1;
    let angle = -Math.PI / 2;
    entries.forEach((entry, index) => {
        const weight = clampWeight(entry.weight);
        const slice = (weight / total) * Math.PI * 2;
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
        ctx2d.fillStyle = s.textColor || '#ffffff';
        ctx2d.shadowColor = 'rgba(0,0,0,.62)';
        ctx2d.shadowBlur = 5;
        ctx2d.font = `700 ${Math.max(12, size / 35)}px system-ui, sans-serif`;
        const pct = Math.round((weight / total) * 100);
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

function buildOverlay() {
    if (document.getElementById('wof-overlay')) {
        overlay = document.getElementById('wof-overlay');
        canvas = document.getElementById('wof-canvas');
        ctx2d = canvas?.getContext('2d');
        applyAppearance();
        return;
    }

    const html = `
    <div id="wof-overlay" class="wof-overlay" aria-hidden="true">
      <div class="wof-shell">
        <div class="wof-topbar">
          <div class="wof-brand">
            <div class="wof-brand-icon">🎡</div>
            <div><div class="wof-title" id="wof-overlay-title">Wheel of Fortune</div><div class="wof-subtitle" id="wof-source-label">Weighted roleplay forfeits</div></div>
          </div>
          <button id="wof-close" class="wof-close" title="Close">✕</button>
        </div>
        <div id="wof-stage" class="wof-stage">
          <div class="wof-wheel-wrap">
            <div class="wof-pointer"></div>
            <canvas id="wof-canvas" class="wof-canvas"></canvas>
            <button id="wof-center" class="wof-center" type="button"><b>SPIN</b><span>the wheel</span></button>
          </div>
        </div>
        <div id="wof-result" class="wof-result">
          <div class="wof-result-label">The wheel chose</div>
          <div id="wof-result-title" class="wof-result-title"></div>
          <div id="wof-result-body" class="wof-result-body"></div>
        </div>
        <div class="wof-actions">
          <button id="wof-spin-again" class="wof-action wof-action-primary">🎲 Spin again</button>
          <button id="wof-close-bottom" class="wof-action">Close</button>
        </div>
        <details class="wof-history"><summary>Recent spins</summary><div id="wof-history-list" class="wof-history-list"></div></details>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    overlay = document.getElementById('wof-overlay');
    canvas = document.getElementById('wof-canvas');
    ctx2d = canvas?.getContext('2d');
    document.getElementById('wof-close')?.addEventListener('click', closeWheel);
    document.getElementById('wof-close-bottom')?.addEventListener('click', closeWheel);
    document.getElementById('wof-center')?.addEventListener('click', () => spinWheel());
    document.getElementById('wof-spin-again')?.addEventListener('click', () => spinWheel());
    overlay?.addEventListener('click', e => { if (e.target === overlay && !spinning) closeWheel(); });
    window.addEventListener('resize', () => drawWheel(currentEntries, getState().hiddenSpin && spinning));
    applyAppearance();
}

function syncFloatingButton() {
    if (!state) return;
    let button = document.getElementById('wof-floating-button');
    if (state.floatingButton) {
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
        button.style.setProperty('--wof-accent', state.accentColor || '#7b54ff');
    } else {
        button?.remove();
    }
}

function renderHistory() {
    const host = document.getElementById('wof-history-list');
    if (!host) return;
    host.innerHTML = getState().history.slice(0, 10)
        .map(h => `<div class="wof-history-item"><span>${esc(h.title)}</span><span>${esc(h.time)}</span></div>`)
        .join('') || '<div>No spins yet.</div>';
}

async function openWheel(options = {}) {
    const s = getState();
    buildOverlay();
    applyAppearance();
    currentEntries = await resolveEntries();
    if (!currentEntries.length) {
        toastr.warning(s.source === 'lorebook' ? 'No eligible Lorebook entries found.' : 'Add at least one forfeit.', 'Wheel of Fortune');
        return false;
    }
    const hidden = options.hidden ?? s.hiddenSpin;
    overlay.dataset.hidden = String(hidden);
    overlay.classList.toggle('wof-hidden', hidden);
    overlay.classList.remove('wof-revealed');
    overlay.classList.add('wof-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('wof-result')?.classList.remove('wof-show');
    const sourceLabel = document.getElementById('wof-source-label');
    if (sourceLabel) sourceLabel.textContent = s.source === 'lorebook' ? `Lorebook: ${s.lorebook || 'not selected'}` : `${currentEntries.length} weighted forfeits`;
    drawWheel(currentEntries, hidden);
    renderHistory();
    return true;
}

function closeWheel() {
    if (!overlay || spinning) return;
    overlay.classList.remove('wof-open');
    overlay.setAttribute('aria-hidden', 'true');
}

function formatResult(entry) {
    return `🎡 ${getState().wheelTitle || 'Wheel of Fortune'} — ${entry.title}${entry.description ? `\n${entry.description}` : ''}`;
}

function clearInjectedPrompt() {
    try {
        getContext().setExtensionPrompt(PROMPT_KEY, '', extension_prompt_types.NONE, 0);
    } catch (error) {
        console.warn('[Wheel of Fortune] Could not clear injected prompt', error);
    }
}

async function deliverResult(entry, mode) {
    const context = getContext();
    const result = formatResult(entry);
    if (mode === 'system') {
        context.sendSystemMessage('generic', result, { wof_result: true });
        await context.saveChat?.();
    } else if (mode === 'prompt') {
        context.setExtensionPrompt(
            PROMPT_KEY,
            `A Wheel of Fortune spin just selected the following roleplay forfeit. Treat it as an event/rule to acknowledge and incorporate naturally into the next response:\n\n${entry.title}\n${entry.description}`,
            extension_prompt_types.IN_CHAT,
            0,
        );
        clearTimeout(promptTimeout);
        promptTimeout = setTimeout(clearInjectedPrompt, 120000);
        toastr.success('Result silently injected into the next generation.', 'Wheel of Fortune');
    } else {
        toastr.info(`Private result: ${entry.title}`, 'Wheel of Fortune', { timeOut: 6000 });
    }
}

function calculateRotation(entries, index) {
    const s = getState();
    const centerDeg = segmentCenterDegrees(entries, index);
    const normalizedCurrent = ((currentRotation % 360) + 360) % 360;
    const targetMod = ((-90 - centerDeg) % 360 + 360) % 360;
    let delta = ((targetMod - normalizedCurrent) % 360 + 360) % 360;
    let direction = s.spinDirection;
    if (direction === 'random') direction = Math.random() < 0.5 ? 'clockwise' : 'counterclockwise';
    const turns = 6 + Math.floor(Math.random() * 3);
    if (direction === 'counterclockwise') {
        if (delta !== 0) delta -= 360;
        return currentRotation - (360 * turns) + delta;
    }
    return currentRotation + (360 * turns) + delta;
}

async function spinWheel(options = {}) {
    if (spinning) return '';
    const s = getState();
    const opened = overlay?.classList.contains('wof-open') || await openWheel(options);
    if (!opened) return '';
    currentEntries = await resolveEntries();
    if (!currentEntries.length) return '';

    spinning = true;
    const center = document.getElementById('wof-center');
    const resultBox = document.getElementById('wof-result');
    center?.classList.add('wof-disabled');
    resultBox?.classList.remove('wof-show');

    const hidden = options.hidden ?? s.hiddenSpin;
    overlay.classList.toggle('wof-hidden', hidden);
    overlay.classList.remove('wof-revealed');
    drawWheel(currentEntries, hidden);

    const { entry, index } = weightedPick(currentEntries);
    currentRotation = calculateRotation(currentEntries, index);
    const seconds = clampNumber(options.seconds ?? s.spinSeconds, 2, 15, 5.5);
    canvas.style.transition = `transform ${seconds}s cubic-bezier(.08,.67,.08,1)`;
    requestAnimationFrame(() => {
        canvas.style.transform = `rotate(${currentRotation}deg)`;
    });

    await new Promise(resolve => setTimeout(resolve, seconds * 1000 + 100));
    spinning = false;
    center?.classList.remove('wof-disabled');
    overlay.classList.add('wof-revealed');
    if (hidden) drawWheel(currentEntries, false);

    const titleEl = document.getElementById('wof-result-title');
    const bodyEl = document.getElementById('wof-result-body');
    if (titleEl) titleEl.textContent = entry.title;
    if (bodyEl) bodyEl.textContent = entry.description || '';
    resultBox?.classList.add('wof-show');

    state.history.unshift({ title: entry.title, time: new Date().toLocaleString(), source: state.source });
    state.history = state.history.slice(0, 30);
    if (state.removeOnce && entry.once && entry.sourceId && !state.removedIds.includes(entry.sourceId)) state.removedIds.push(entry.sourceId);
    persist();
    renderHistory();

    const mode = options.mode || state.resultMode;
    await deliverResult(entry, mode);
    if (state.autoClose) setTimeout(closeWheel, 1300);
    return entry.title;
}

function renderManualEntries() {
    const host = document.getElementById('wof-entry-list');
    if (!host) return;
    host.innerHTML = getState().entries.map((entry, index) => `
      <div class="wof-entry" data-index="${index}">
        <input class="text_pole wof-entry-title" value="${esc(entry.title)}" title="Forfeit title">
        <input class="text_pole wof-entry-weight" type="number" min="0.1" step="0.1" value="${esc(entry.weight)}" title="Weight">
        <button class="menu_button wof-entry-once" title="Remove after it is selected">${entry.once ? '1×' : '∞'}</button>
        <button class="menu_button wof-entry-delete" title="Delete">✕</button>
        <textarea class="text_pole wof-entry-description" style="grid-column:1/-1" rows="2" placeholder="Description / instruction">${esc(entry.description)}</textarea>
      </div>`).join('');

    host.querySelectorAll('.wof-entry').forEach(row => {
        const index = Number(row.dataset.index);
        row.querySelector('.wof-entry-title')?.addEventListener('input', e => { state.entries[index].title = e.target.value; persist(); });
        row.querySelector('.wof-entry-weight')?.addEventListener('input', e => { state.entries[index].weight = clampWeight(e.target.value); persist(); });
        row.querySelector('.wof-entry-description')?.addEventListener('input', e => { state.entries[index].description = e.target.value; persist(); });
        row.querySelector('.wof-entry-once')?.addEventListener('click', () => { state.entries[index].once = !state.entries[index].once; persist(); renderManualEntries(); });
        row.querySelector('.wof-entry-delete')?.addEventListener('click', () => { state.entries.splice(index, 1); persist(); renderManualEntries(); });
    });
}

function addManualEntry() {
    getState().entries.push({ id: makeId(), title: 'New forfeit', description: '', weight: 1, once: false });
    persist();
    renderManualEntries();
}

async function refreshLorebooks() {
    const select = document.getElementById('wof-lorebook');
    if (!select) return;
    const names = getContext().getWorldInfoNames?.() ?? [];
    select.innerHTML = '<option value="">— Select a Lorebook —</option>' + names.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
    select.value = names.includes(getState().lorebook) ? state.lorebook : '';
}

function syncVisibility() {
    document.getElementById('wof-lorebook-options')?.toggleAttribute('hidden', getState().source !== 'lorebook');
    document.getElementById('wof-manual-options')?.toggleAttribute('hidden', getState().source !== 'manual');
    const custom = document.getElementById('wof-custom-colors-wrap');
    if (custom) custom.toggleAttribute('hidden', getState().wheelTheme !== 'custom');
}

function updateCharacterHint() {
    const s = getState();
    try {
        const context = getContext();
        if (s.triggerEnabled && s.characterHint && s.triggerToken) {
            context.setExtensionPrompt(
                TRIGGER_PROMPT_KEY,
                `Wheel of Fortune tool: When you intentionally want to trigger the roleplay Wheel of Fortune, output the exact token ${s.triggerToken}. Only use it when you truly choose to spin; do not explain the token.`,
                extension_prompt_types.IN_PROMPT,
                0,
            );
        } else {
            context.setExtensionPrompt(TRIGGER_PROMPT_KEY, '', extension_prompt_types.NONE, 0);
        }
    } catch (error) {
        console.warn('[Wheel of Fortune] Could not update character trigger hint', error);
    }
}

function bindSetting(id, key, event = 'change', transform = v => v, onChange = null) {
    const el = document.getElementById(id);
    if (!el) return;
    const s = getState();
    if (el.type === 'checkbox') el.checked = Boolean(s[key]); else el.value = s[key] ?? '';
    el.addEventListener(event, e => {
        const raw = el.type === 'checkbox' ? e.target.checked : e.target.value;
        state[key] = transform(raw);
        persist();
        if (['triggerEnabled', 'triggerToken', 'characterHint'].includes(key)) updateCharacterHint();
        if (['source', 'wheelTheme'].includes(key)) syncVisibility();
        if (['wheelTitle', 'wheelTheme', 'wheelSize', 'accentColor', 'pointerColor', 'textColor', 'segmentColors', 'showWeights', 'floatingButton'].includes(key)) {
            applyAppearance();
            if (currentEntries.length) drawWheel(currentEntries, state.hiddenSpin && spinning);
        }
        onChange?.(state[key]);
    });
}

async function bindSettingsUi() {
    const settingsHtml = await renderExtensionTemplateAsync('third-party/WheelofFortune', 'settings');
    const container = document.getElementById('extensions_settings');
    if (!container) throw new Error('SillyTavern extension settings container was not found.');
    if (!document.getElementById('wof-settings')) container.insertAdjacentHTML('beforeend', settingsHtml);

    bindSetting('wof-trigger-enabled', 'triggerEnabled');
    bindSetting('wof-trigger-token', 'triggerToken', 'input', String);
    bindSetting('wof-trigger-user', 'triggerUser');
    bindSetting('wof-character-hint', 'characterHint');
    bindSetting('wof-result-mode', 'resultMode');
    bindSetting('wof-hidden-spin', 'hiddenSpin');
    bindSetting('wof-auto-close', 'autoClose');
    bindSetting('wof-source', 'source');
    bindSetting('wof-lorebook-mode', 'lorebookMode');
    bindSetting('wof-remove-once', 'removeOnce');
    bindSetting('wof-spin-seconds', 'spinSeconds', 'input', v => clampNumber(v, 2, 15, 5.5));

    bindSetting('wof-wheel-title', 'wheelTitle', 'input', String);
    bindSetting('wof-wheel-theme', 'wheelTheme');
    bindSetting('wof-wheel-size', 'wheelSize', 'input', v => clampNumber(v, 300, 760, 520));
    bindSetting('wof-accent-color', 'accentColor', 'input', String);
    bindSetting('wof-pointer-color', 'pointerColor', 'input', String);
    bindSetting('wof-text-color', 'textColor', 'input', String);
    bindSetting('wof-segment-colors', 'segmentColors', 'input', String);
    bindSetting('wof-show-weights', 'showWeights');
    bindSetting('wof-floating-button-enabled', 'floatingButton');
    bindSetting('wof-spin-direction', 'spinDirection');

    document.getElementById('wof-open')?.addEventListener('click', () => openWheel());
    document.getElementById('wof-spin-settings')?.addEventListener('click', () => spinWheel());
    document.getElementById('wof-add-entry')?.addEventListener('click', addManualEntry);
    document.getElementById('wof-refresh-lorebooks')?.addEventListener('click', refreshLorebooks);
    document.getElementById('wof-lorebook')?.addEventListener('change', e => { state.lorebook = e.target.value; state.removedIds = []; persist(); });
    document.getElementById('wof-reset')?.addEventListener('click', () => {
        if (!confirm('Reset Wheel of Fortune settings and entries to defaults?')) return;
        extension_settings[MODULE] = structuredClone(defaults);
        state = null;
        ensureSettings();
        location.reload();
    });

    renderManualEntries();
    await refreshLorebooks();
    syncVisibility();
    applyAppearance();
}

function messageFingerprint(message, index) {
    return `${index}:${message?.is_user ? 'u' : 'a'}:${String(message?.mes ?? '')}`;
}

async function inspectLatestMessage({ allowUser = false } = {}) {
    const s = getState();
    if (!s.triggerEnabled || !s.triggerToken || spinning) return;
    const context = getContext();
    const index = context.chat.length - 1;
    const message = context.chat[index];
    if (!message || message.is_system) return;
    if (message.is_user && !(s.triggerUser && allowUser)) return;
    if (!String(message.mes ?? '').includes(s.triggerToken)) return;
    const fingerprint = messageFingerprint(message, index);
    if (fingerprint === lastTriggerFingerprint) return;
    lastTriggerFingerprint = fingerprint;
    await spinWheel();
}

function registerCommands() {
    if (commandsRegistered) return;
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wheel',
        aliases: ['spinwheel', 'wof'],
        callback: async args => {
            getState();
            return spinWheel({
                hidden: args.hidden === undefined ? undefined : String(args.hidden).toLowerCase() === 'true',
                mode: ['system', 'prompt', 'private'].includes(String(args.mode)) ? String(args.mode) : undefined,
            });
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'hidden', description: 'Hide wheel labels until it lands', typeList: [ARGUMENT_TYPE.BOOLEAN] }),
            SlashCommandNamedArgument.fromProps({ name: 'mode', description: 'Result mode: system, prompt, or private', typeList: [ARGUMENT_TYPE.STRING] }),
        ],
        returns: 'selected forfeit title',
        helpString: '<div>Open and spin the animated Wheel of Fortune. Examples: <code>/wheel</code>, <code>/wheel hidden=true</code>, <code>/wheel mode=private</code>.</div>',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wheel-open',
        aliases: ['wof-open'],
        callback: async () => { getState(); await openWheel(); return ''; },
        helpString: 'Open the animated Wheel of Fortune on screen without spinning it.',
    }));

    commandsRegistered = true;
    console.info('[Wheel of Fortune] Slash commands registered: /wheel, /wof, /spinwheel, /wheel-open');
}

// Register commands as soon as the JS module has loaded. Do not make command availability
// depend on the settings template or other optional UI initialization succeeding.
try {
    registerCommands();
} catch (error) {
    console.error('[Wheel of Fortune] Slash command registration failed', error);
}

jQuery(async () => {
    try {
        ensureSettings();
        buildOverlay();
        syncFloatingButton();
        updateCharacterHint();

        // Register again defensively if early registration ran before the parser was ready.
        try { registerCommands(); } catch (error) { console.warn('[Wheel of Fortune] Deferred command registration failed', error); }

        try {
            await bindSettingsUi();
        } catch (error) {
            console.error('[Wheel of Fortune] Settings UI failed to initialize. Wheel commands remain available.', error);
            toastr.warning('Wheel loaded, but its settings panel could not be created. Check the browser console.', 'Wheel of Fortune');
        }

        eventSource.on(event_types.MESSAGE_RECEIVED, () => inspectLatestMessage({ allowUser: false }));
        if (event_types.MESSAGE_SENT) eventSource.on(event_types.MESSAGE_SENT, () => inspectLatestMessage({ allowUser: true }));
        eventSource.on(event_types.CHAT_CHANGED, () => {
            lastTriggerFingerprint = '';
            clearInjectedPrompt();
            updateCharacterHint();
        });

        console.info('[Wheel of Fortune] Extension v1.1 loaded');
    } catch (error) {
        console.error('[Wheel of Fortune] Fatal initialization error', error);
        toastr.error('Wheel of Fortune failed to initialize. Open the browser console for details.', 'Wheel of Fortune');
    }
});
