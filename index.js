import { eventSource, event_types, extension_prompt_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';

const MODULE = 'wheel-of-fortune';
const PROMPT_KEY = 'WHEEL_OF_FORTUNE_RESULT';

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
    entries: [
        { id: crypto.randomUUID(), title: 'Tell an embarrassing secret', description: 'The selected character must reveal an embarrassing but believable secret.', weight: 3, once: false },
        { id: crypto.randomUUID(), title: 'Truth or dare', description: 'The selected character must choose truth or dare and follow through.', weight: 3, once: false },
        { id: crypto.randomUUID(), title: 'Unexpected confession', description: 'A character makes an unexpected confession that changes the mood of the scene.', weight: 2, once: false },
        { id: crypto.randomUUID(), title: 'Role reversal', description: 'For the next scene beat, reverse the usual social roles or power dynamic.', weight: 2, once: false },
        { id: crypto.randomUUID(), title: 'Wildcard', description: 'Invent a surprising but story-compatible forfeit appropriate to the current scene.', weight: 1, once: false },
        { id: crypto.randomUUID(), title: 'Lucky escape', description: 'No forfeit this time. The character gets away with it.', weight: 1, once: false },
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

function ensureSettings() {
    if (!extension_settings[MODULE]) extension_settings[MODULE] = {};
    const saved = extension_settings[MODULE];
    state = Object.assign({}, structuredClone(defaults), saved);
    state.entries = Array.isArray(saved.entries) && saved.entries.length ? saved.entries : structuredClone(defaults.entries);
    state.removedIds = Array.isArray(saved.removedIds) ? saved.removedIds : [];
    state.history = Array.isArray(saved.history) ? saved.history : [];
    saveSettingsDebounced();
}

function persist() {
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

function normalizeManualEntries() {
    return state.entries
        .filter(e => e && e.title && !state.removedIds.includes(e.id))
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
    const context = getContext();
    if (!state.lorebook) return [];
    try {
        const book = await context.loadWorldInfo(state.lorebook);
        const values = Object.values(book?.entries ?? {});
        return values
            .filter(entry => entry && !entry.disable)
            .map(entry => {
                const meta = parseLorebookMeta(entry);
                const keys = Array.isArray(entry.key) ? entry.key.filter(Boolean) : [];
                const rawTitle = String(entry.comment || keys[0] || `Lorebook entry ${entry.uid ?? ''}`);
                const title = rawTitle.replace(/\[(?:wheel|once|weight\s*=\s*[^\]]+)\]/gi, '').trim() || 'Untitled forfeit';
                return {
                    id: `lorebook:${state.lorebook}:${entry.uid ?? title}`,
                    sourceId: `lorebook:${state.lorebook}:${entry.uid ?? title}`,
                    title,
                    description: String(entry.content ?? '').trim(),
                    weight: meta.weight,
                    once: meta.once,
                    tagged: meta.tagged,
                };
            })
            .filter(entry => state.lorebookMode === 'all' || entry.tagged)
            .filter(entry => !state.removedIds.includes(entry.sourceId));
    } catch (error) {
        console.error('[Wheel of Fortune] Failed to load Lorebook', error);
        toastr.error(`Could not load Lorebook “${state.lorebook}”.`, 'Wheel of Fortune');
        return [];
    }
}

async function resolveEntries() {
    const entries = state.source === 'lorebook' ? await getLorebookEntries() : normalizeManualEntries();
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

function palette(index, total) {
    const hue = (265 + index * (300 / Math.max(total, 1))) % 360;
    return `hsl(${hue} 72% ${index % 2 ? 53 : 60}%)`;
}

function fitLabel(text, max = 23) {
    const clean = String(text).trim();
    return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function drawWheel(entries, concealLabels = false) {
    if (!ctx2d || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const size = Math.max(420, Math.floor(rect.width * (window.devicePixelRatio || 1)));
    if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
    }
    const c = canvas.width / 2;
    const radius = c - 8;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    const total = entries.reduce((sum, e) => sum + clampWeight(e.weight), 0) || 1;
    let angle = -Math.PI / 2;
    entries.forEach((entry, index) => {
        const slice = (clampWeight(entry.weight) / total) * Math.PI * 2;
        ctx2d.beginPath();
        ctx2d.moveTo(c, c);
        ctx2d.arc(c, c, radius, angle, angle + slice);
        ctx2d.closePath();
        ctx2d.fillStyle = palette(index, entries.length);
        ctx2d.fill();
        ctx2d.strokeStyle = 'rgba(255,255,255,.38)';
        ctx2d.lineWidth = Math.max(2, size / 260);
        ctx2d.stroke();

        const middle = angle + slice / 2;
        ctx2d.save();
        ctx2d.translate(c, c);
        ctx2d.rotate(middle);
        ctx2d.textAlign = 'right';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillStyle = 'white';
        ctx2d.shadowColor = 'rgba(0,0,0,.5)';
        ctx2d.shadowBlur = 4;
        ctx2d.font = `700 ${Math.max(12, size / 35)}px system-ui, sans-serif`;
        ctx2d.fillText(concealLabels ? '???' : fitLabel(entry.title), radius * .9, 0);
        ctx2d.restore();
        angle += slice;
    });

    ctx2d.beginPath();
    ctx2d.arc(c, c, radius, 0, Math.PI * 2);
    ctx2d.strokeStyle = 'rgba(255,255,255,.78)';
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
        ctx2d = canvas.getContext('2d');
        return;
    }
    const html = `
    <div id="wof-overlay" class="wof-overlay" aria-hidden="true">
      <div class="wof-shell">
        <div class="wof-topbar">
          <div class="wof-brand"><div class="wof-brand-icon">🎡</div><div><div class="wof-title">Wheel of Fortune</div><div class="wof-subtitle" id="wof-source-label">Weighted roleplay forfeits</div></div></div>
          <button id="wof-close" class="wof-close" title="Close">✕</button>
        </div>
        <div id="wof-stage" class="wof-stage">
          <div class="wof-wheel-wrap">
            <div class="wof-pointer"></div>
            <canvas id="wof-canvas" class="wof-canvas"></canvas>
            <div id="wof-center" class="wof-center"><b>SPIN</b><span>the wheel</span></div>
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
    ctx2d = canvas.getContext('2d');
    document.getElementById('wof-close').addEventListener('click', closeWheel);
    document.getElementById('wof-close-bottom').addEventListener('click', closeWheel);
    document.getElementById('wof-center').addEventListener('click', () => spinWheel());
    document.getElementById('wof-spin-again').addEventListener('click', () => spinWheel());
    overlay.addEventListener('click', e => { if (e.target === overlay && !spinning) closeWheel(); });
    window.addEventListener('resize', () => drawWheel(currentEntries, state.hiddenSpin && spinning));
}

function renderHistory() {
    const host = document.getElementById('wof-history-list');
    if (!host) return;
    host.innerHTML = state.history.slice(0, 10).map(h => `<div class="wof-history-item"><span>${esc(h.title)}</span><span>${esc(h.time)}</span></div>`).join('') || '<div>No spins yet.</div>';
}

async function openWheel(options = {}) {
    buildOverlay();
    currentEntries = await resolveEntries();
    if (!currentEntries.length) {
        toastr.warning(state.source === 'lorebook' ? 'No eligible Lorebook entries found.' : 'Add at least one forfeit.', 'Wheel of Fortune');
        return false;
    }
    const hidden = options.hidden ?? state.hiddenSpin;
    overlay.dataset.hidden = String(hidden);
    overlay.classList.toggle('wof-hidden', hidden);
    overlay.classList.remove('wof-revealed');
    overlay.classList.add('wof-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('wof-result').classList.remove('wof-show');
    document.getElementById('wof-source-label').textContent = state.source === 'lorebook' ? `Lorebook: ${state.lorebook || 'not selected'}` : `${currentEntries.length} weighted forfeits`;
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
    return `🎡 Wheel of Fortune — ${entry.title}${entry.description ? `\n${entry.description}` : ''}`;
}

function clearInjectedPrompt() {
    const context = getContext();
    context.setExtensionPrompt(PROMPT_KEY, '', extension_prompt_types.NONE, 0);
}

async function deliverResult(entry, mode) {
    const context = getContext();
    const result = formatResult(entry);
    if (mode === 'system') {
        context.sendSystemMessage('generic', result, { wof_result: true });
        await context.saveChat?.();
    } else if (mode === 'prompt') {
        context.setExtensionPrompt(PROMPT_KEY, `A Wheel of Fortune spin just selected the following roleplay forfeit. Treat it as an event/rule to acknowledge and incorporate naturally into the next response:\n\n${entry.title}\n${entry.description}`, extension_prompt_types.IN_CHAT, 0);
        clearTimeout(promptTimeout);
        promptTimeout = setTimeout(clearInjectedPrompt, 120000);
        toastr.success('Result silently injected into the next generation.', 'Wheel of Fortune');
    } else {
        toastr.info(`Private result: ${entry.title}`, 'Wheel of Fortune', { timeOut: 6000 });
    }
}

async function spinWheel(options = {}) {
    if (spinning) return '';
    const opened = overlay?.classList.contains('wof-open') || await openWheel(options);
    if (!opened) return '';
    currentEntries = await resolveEntries();
    if (!currentEntries.length) return '';

    spinning = true;
    const center = document.getElementById('wof-center');
    const resultBox = document.getElementById('wof-result');
    center.classList.add('wof-disabled');
    resultBox.classList.remove('wof-show');

    const hidden = options.hidden ?? state.hiddenSpin;
    overlay.classList.toggle('wof-hidden', hidden);
    overlay.classList.remove('wof-revealed');
    drawWheel(currentEntries, hidden);

    const { entry, index } = weightedPick(currentEntries);
    const centerDeg = segmentCenterDegrees(currentEntries, index);
    const normalizedCurrent = ((currentRotation % 360) + 360) % 360;
    const targetMod = ((-90 - centerDeg) % 360 + 360) % 360;
    const delta = ((targetMod - normalizedCurrent) % 360 + 360) % 360;
    currentRotation += 360 * (6 + Math.floor(Math.random() * 3)) + delta;
    const seconds = Math.max(2, Math.min(15, Number(options.seconds ?? state.spinSeconds) || 5.5));
    canvas.style.transition = `transform ${seconds}s cubic-bezier(.12,.72,.08,1)`;
    requestAnimationFrame(() => { canvas.style.transform = `rotate(${currentRotation}deg)`; });

    await new Promise(resolve => setTimeout(resolve, seconds * 1000 + 80));
    spinning = false;
    center.classList.remove('wof-disabled');
    overlay.classList.add('wof-revealed');
    if (hidden) drawWheel(currentEntries, false);

    document.getElementById('wof-result-title').textContent = entry.title;
    document.getElementById('wof-result-body').textContent = entry.description || '';
    resultBox.classList.add('wof-show');

    state.history.unshift({ title: entry.title, time: new Date().toLocaleString(), source: state.source });
    state.history = state.history.slice(0, 30);
    if (state.removeOnce && entry.once && entry.sourceId) state.removedIds.push(entry.sourceId);
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
    host.innerHTML = state.entries.map((entry, index) => `
      <div class="wof-entry" data-index="${index}">
        <input class="text_pole wof-entry-title" value="${esc(entry.title)}" title="Forfeit title">
        <input class="text_pole wof-entry-weight" type="number" min="0.1" step="0.1" value="${esc(entry.weight)}" title="Weight">
        <button class="menu_button wof-entry-once" title="Remove after it is selected">${entry.once ? '1×' : '∞'}</button>
        <button class="menu_button wof-entry-delete" title="Delete">✕</button>
        <textarea class="text_pole wof-entry-description" style="grid-column:1/-1" rows="2" placeholder="Description / instruction">${esc(entry.description)}</textarea>
      </div>`).join('');

    host.querySelectorAll('.wof-entry').forEach(row => {
        const index = Number(row.dataset.index);
        row.querySelector('.wof-entry-title').addEventListener('input', e => { state.entries[index].title = e.target.value; persist(); });
        row.querySelector('.wof-entry-weight').addEventListener('input', e => { state.entries[index].weight = clampWeight(e.target.value); persist(); });
        row.querySelector('.wof-entry-description').addEventListener('input', e => { state.entries[index].description = e.target.value; persist(); });
        row.querySelector('.wof-entry-once').addEventListener('click', () => { state.entries[index].once = !state.entries[index].once; persist(); renderManualEntries(); });
        row.querySelector('.wof-entry-delete').addEventListener('click', () => { state.entries.splice(index, 1); persist(); renderManualEntries(); });
    });
}

function addManualEntry() {
    state.entries.push({ id: crypto.randomUUID(), title: 'New forfeit', description: '', weight: 1, once: false });
    persist();
    renderManualEntries();
}

async function refreshLorebooks() {
    const select = document.getElementById('wof-lorebook');
    if (!select) return;
    const names = getContext().getWorldInfoNames?.() ?? [];
    select.innerHTML = '<option value="">— Select a Lorebook —</option>' + names.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
    select.value = names.includes(state.lorebook) ? state.lorebook : '';
}

function syncVisibility() {
    document.getElementById('wof-lorebook-options')?.toggleAttribute('hidden', state.source !== 'lorebook');
    document.getElementById('wof-manual-options')?.toggleAttribute('hidden', state.source !== 'manual');
}

function updateCharacterHint() {
    const context = getContext();
    if (state.triggerEnabled && state.characterHint && state.triggerToken) {
        context.setExtensionPrompt(`${PROMPT_KEY}_TRIGGER`, `Wheel of Fortune tool: When you intentionally want to trigger the roleplay Wheel of Fortune, output the exact token ${state.triggerToken}. Only use it when you truly choose to spin; do not explain the token.`, extension_prompt_types.IN_PROMPT, 0);
    } else {
        context.setExtensionPrompt(`${PROMPT_KEY}_TRIGGER`, '', extension_prompt_types.NONE, 0);
    }
}

function bindSetting(id, key, event = 'change', transform = v => v) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = Boolean(state[key]); else el.value = state[key];
    el.addEventListener(event, e => {
        const raw = el.type === 'checkbox' ? e.target.checked : e.target.value;
        state[key] = transform(raw);
        persist();
        if (['triggerEnabled', 'triggerToken', 'characterHint'].includes(key)) updateCharacterHint();
        if (key === 'source') syncVisibility();
    });
}

async function bindSettingsUi() {
    const settingsHtml = await renderExtensionTemplateAsync('third-party/WheelofFortune', 'settings');
    const container = document.getElementById('extensions_settings');
    container.insertAdjacentHTML('beforeend', settingsHtml);

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
    bindSetting('wof-spin-seconds', 'spinSeconds', 'input', v => Math.max(2, Math.min(15, Number(v) || 5.5)));

    document.getElementById('wof-open').addEventListener('click', () => openWheel());
    document.getElementById('wof-spin-settings').addEventListener('click', () => spinWheel());
    document.getElementById('wof-add-entry').addEventListener('click', addManualEntry);
    document.getElementById('wof-refresh-lorebooks').addEventListener('click', refreshLorebooks);
    document.getElementById('wof-lorebook').addEventListener('change', e => { state.lorebook = e.target.value; state.removedIds = []; persist(); });
    document.getElementById('wof-reset').addEventListener('click', () => {
        if (!confirm('Reset Wheel of Fortune settings and entries to defaults?')) return;
        extension_settings[MODULE] = structuredClone(defaults);
        ensureSettings();
        location.reload();
    });

    renderManualEntries();
    await refreshLorebooks();
    syncVisibility();
}

function messageFingerprint(message, index) {
    return `${index}:${message?.is_user ? 'u' : 'a'}:${String(message?.mes ?? '')}`;
}

async function inspectLatestMessage({ allowUser = false } = {}) {
    if (!state.triggerEnabled || !state.triggerToken || spinning) return;
    const context = getContext();
    const index = context.chat.length - 1;
    const message = context.chat[index];
    if (!message || message.is_system) return;
    if (message.is_user && !(state.triggerUser && allowUser)) return;
    if (!String(message.mes ?? '').includes(state.triggerToken)) return;
    const fingerprint = messageFingerprint(message, index);
    if (fingerprint === lastTriggerFingerprint) return;
    lastTriggerFingerprint = fingerprint;
    await spinWheel();
}

function registerCommands() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wheel',
        aliases: ['spinwheel', 'wof'],
        callback: async args => spinWheel({
            hidden: args.hidden === undefined ? undefined : String(args.hidden).toLowerCase() === 'true',
            mode: ['system', 'prompt', 'private'].includes(String(args.mode)) ? String(args.mode) : undefined,
        }),
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'hidden', description: 'Hide wheel labels until it lands', typeList: [ARGUMENT_TYPE.BOOLEAN], defaultValue: 'false' }),
            SlashCommandNamedArgument.fromProps({ name: 'mode', description: 'Result mode: system, prompt, or private', typeList: [ARGUMENT_TYPE.STRING] }),
        ],
        returns: 'selected forfeit title',
        helpString: '<div>Spin the animated Wheel of Fortune. Examples: <code>/wheel</code>, <code>/wheel hidden=true</code>, <code>/wheel mode=private</code>.</div>',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wheel-open',
        callback: async () => { await openWheel(); return ''; },
        helpString: 'Open the Wheel of Fortune without spinning it.',
    }));
}

jQuery(async () => {
    ensureSettings();
    buildOverlay();
    await bindSettingsUi();
    registerCommands();
    updateCharacterHint();

    eventSource.on(event_types.MESSAGE_RECEIVED, () => inspectLatestMessage({ allowUser: false }));
    if (event_types.MESSAGE_SENT) eventSource.on(event_types.MESSAGE_SENT, () => inspectLatestMessage({ allowUser: true }));
    eventSource.on(event_types.CHAT_CHANGED, () => {
        lastTriggerFingerprint = '';
        clearInjectedPrompt();
        updateCharacterHint();
    });

    console.info('[Wheel of Fortune] Extension loaded');
});
