import { eventSource, event_types, extension_prompt_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../extensions.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from '../../../slash-commands/SlashCommandArgument.js';

const MODULE = 'wheel-of-fortune';
const PROMPT_KEY = 'WHEEL_OF_FORTUNE_RESULT';
const TRIGGER_PROMPT_KEY = 'WHEEL_OF_FORTUNE_TRIGGER';
const EXTENDED_TRIGGER_RE = /\[\[SPIN_WHEEL(?:\s+([^\]]+))?\]\]/i;
const VALID_ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

function makeId() {
    try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* ignore */ }
    return `wof-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const defaults = {
    triggerEnabled: true,
    triggerToken: '[[SPIN_WHEEL]]',
    triggerUser: false,
    characterHint: true,
    visibilityMode: 'full',
    resultMode: 'system',
    secretResultToCharacter: true,
    autoClose: false,
    source: 'manual',
    lorebook: '',
    lorebookMode: 'tagged',
    removeOnce: true,
    spinSeconds: 10.5,
    revealDelay: 1.4,
    spinDirection: 'clockwise',
    adaptiveEnabled: false,
    defaultLevel: 1,
    maxLevel: 5,
    autoLevelEvery: 3,
    progressByChat: {},
    cooldownsByChat: {},
    removedIdsByChat: {},
    migratedRemovedIdsV13: false,
    wheelTitle: 'Wheel of Fortune',
    wheelTheme: 'neon',
    wheelSize: 520,
    accentColor: '#7b54ff',
    pointerColor: '#fff3b0',
    textColor: '#ffffff',
    segmentColors: '#7c4dff, #e449d6, #ff5c8a, #ff9854, #ffd166, #52d6a8, #39b9ff, #5965ff',
    showWeights: false,
    floatingButton: true,
    entries: [
        { id: makeId(), title: 'Tell an embarrassing secret', description: 'The selected character must reveal an embarrassing but believable secret.', weight: 3, once: false, minLevel: 1, maxLevel: 5, cooldown: 0 },
        { id: makeId(), title: 'Truth or dare', description: 'The selected character must choose truth or dare and follow through.', weight: 3, once: false, minLevel: 1, maxLevel: 5, cooldown: 1 },
        { id: makeId(), title: 'Unexpected confession', description: 'A character makes an unexpected confession that changes the mood of the scene.', weight: 2, once: false, minLevel: 2, maxLevel: 5, cooldown: 1 },
        { id: makeId(), title: 'Role reversal', description: 'For the next scene beat, reverse the usual social roles or power dynamic.', weight: 2, once: false, minLevel: 2, maxLevel: 5, cooldown: 2 },
        { id: makeId(), title: 'Wildcard', description: 'Invent a surprising but story-compatible forfeit appropriate to the current scene.', weight: 1, once: false, minLevel: 3, maxLevel: 5, cooldown: 2 },
        { id: makeId(), title: 'Lucky escape', description: 'No forfeit this time. The character gets away with it.', weight: 1, once: false, minLevel: 1, maxLevel: 5, cooldown: 1 },
    ],
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
let lastValidationSignature = '';

const clone = value => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const clampNumber = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const clampWeight = value => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 1;
};
const esc = value => String(value ?? '').replace(/[&<>'\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

function normalizeVisibility(value) {
    const raw = String(value || '').toLowerCase().trim();
    const aliases = { hidden: 'hidden-wheel', mystery: 'hidden-wheel', 'hide-wheel': 'hidden-wheel', secret: 'hidden-result', 'hide-result': 'hidden-result', both: 'blind', allhidden: 'blind', 'all-hidden': 'blind' };
    const normalized = aliases[raw] || raw;
    return ['full', 'hidden-wheel', 'hidden-result', 'blind'].includes(normalized) ? normalized : 'full';
}
const hideWheelFor = mode => ['hidden-wheel', 'blind'].includes(normalizeVisibility(mode));
const hideResultFor = mode => ['hidden-result', 'blind'].includes(normalizeVisibility(mode));

function normalizeEntry(entry) {
    const minLevel = Math.round(clampNumber(entry?.minLevel, 1, 99, 1));
    const maxLevel = Math.round(clampNumber(entry?.maxLevel, minLevel, 99, 99));
    return {
        ...entry,
        id: entry?.id || makeId(),
        weight: clampWeight(entry?.weight),
        once: Boolean(entry?.once),
        minLevel,
        maxLevel,
        cooldown: Math.round(clampNumber(entry?.cooldown, 0, 99, 0)),
    };
}

function getChatKey() {
    try {
        const c = getContext();
        return String(c?.groupId ? `group:${c.groupId}:${c.chatId || 'default'}` : `char:${c?.characterId ?? 'none'}:${c?.chatId || 'default'}`);
    } catch { return 'global'; }
}

function ensureSettings() {
    if (!extension_settings[MODULE]) extension_settings[MODULE] = {};
    const saved = extension_settings[MODULE];
    state = Object.assign({}, clone(defaults), saved);
    if (!saved.visibilityMode && saved.hiddenSpin) state.visibilityMode = 'hidden-wheel';
    state.visibilityMode = normalizeVisibility(state.visibilityMode);
    state.spinSeconds = clampNumber(state.spinSeconds, 4, 30, 10.5);
    state.revealDelay = clampNumber(state.revealDelay, 0, 5, 1.4);
    state.defaultLevel = Math.round(clampNumber(state.defaultLevel, 1, 10, 1));
    state.maxLevel = Math.round(clampNumber(state.maxLevel, 1, 10, 5));
    state.autoLevelEvery = Math.round(clampNumber(state.autoLevelEvery, 0, 50, 3));
    state.entries = (Array.isArray(saved.entries) && saved.entries.length ? saved.entries : clone(defaults.entries)).map(normalizeEntry);
    state.history = Array.isArray(saved.history) ? saved.history : [];
    state.progressByChat = saved.progressByChat && typeof saved.progressByChat === 'object' ? saved.progressByChat : {};
    state.cooldownsByChat = saved.cooldownsByChat && typeof saved.cooldownsByChat === 'object' ? saved.cooldownsByChat : {};
    state.removedIdsByChat = saved.removedIdsByChat && typeof saved.removedIdsByChat === 'object' ? saved.removedIdsByChat : {};

    if (!saved.migratedRemovedIdsV13 && Array.isArray(saved.removedIds) && saved.removedIds.length) {
        const key = getChatKey();
        state.removedIdsByChat[key] = state.removedIdsByChat[key] || {};
        for (const id of saved.removedIds) state.removedIdsByChat[key][id] = true;
        state.migratedRemovedIdsV13 = true;
    }
    delete state.removedIds;
    extension_settings[MODULE] = state;
    saveSettingsDebounced();
    return state;
}

function getState() { return state || ensureSettings(); }
function persist() { if (state) { extension_settings[MODULE] = state; saveSettingsDebounced(); } }

function getProgress() {
    const s = getState();
    const key = getChatKey();
    if (!s.progressByChat[key]) s.progressByChat[key] = { level: s.defaultLevel, spins: 0 };
    const p = s.progressByChat[key];
    p.level = Math.round(clampNumber(p.level, 1, s.maxLevel, s.defaultLevel));
    p.spins = Math.max(0, Math.round(Number(p.spins) || 0));
    return p;
}
function getCooldownMap() {
    const s = getState(); const key = getChatKey();
    if (!s.cooldownsByChat[key]) s.cooldownsByChat[key] = {};
    return s.cooldownsByChat[key];
}
function getRemovedMap() {
    const s = getState(); const key = getChatKey();
    if (!s.removedIdsByChat[key]) s.removedIdsByChat[key] = {};
    return s.removedIdsByChat[key];
}
function isRemoved(sourceId) { return Boolean(sourceId && getRemovedMap()[sourceId]); }
function markRemoved(sourceId) { if (sourceId) getRemovedMap()[sourceId] = true; }
function getActiveLevel(override) {
    const s = getState();
    if (override !== undefined && override !== null && override !== '') return Math.round(clampNumber(override, 1, s.maxLevel, s.defaultLevel));
    return s.adaptiveEnabled ? getProgress().level : s.defaultLevel;
}
function setCurrentLevel(level) {
    const s = getState();
    getProgress().level = Math.round(clampNumber(level, 1, s.maxLevel, s.defaultLevel));
    persist(); renderProgressUi(); updateCharacterHint();
}
function resetChatProgress() {
    const s = getState(); const key = getChatKey();
    s.progressByChat[key] = { level: s.defaultLevel, spins: 0 };
    s.cooldownsByChat[key] = {};
    s.removedIdsByChat[key] = {};
    persist(); renderProgressUi(); updateCharacterHint();
    toastr.success('This chat\'s level, cooldowns, and one-shot removals were reset.', 'Wheel of Fortune');
}
function advanceProgress(entry) {
    const s = getState(); const p = getProgress(); p.spins += 1;
    if (entry?.sourceId && Number(entry.cooldown) > 0 && !entry.once) getCooldownMap()[entry.sourceId] = p.spins + Number(entry.cooldown);
    if (s.adaptiveEnabled && s.autoLevelEvery > 0 && p.spins % s.autoLevelEvery === 0 && p.level < s.maxLevel) {
        p.level += 1;
        toastr.info(`Wheel intensity increased to level ${p.level}.`, 'Wheel of Fortune');
    }
    persist(); renderProgressUi(); updateCharacterHint();
}

function normalizeManualEntries() {
    return getState().entries.filter(e => e && e.title).map(e => {
        const n = normalizeEntry(e); return { ...n, sourceId: `manual:${n.id}`, stableId: n.id };
    }).filter(e => !isRemoved(e.sourceId));
}

function extractBracketTags(haystack) {
    const tags = [];
    for (const m of String(haystack || '').matchAll(/\[([A-Za-z][\w-]*)(?:\s*=\s*([^\]]+))?\]/g)) {
        tags.push({ name: m[1].toLowerCase(), value: m[2] === undefined ? null : m[2].trim(), raw: m[0] });
    }
    return tags;
}
function tagValues(tags, name) { return tags.filter(t => t.name === name).map(t => t.value); }
function firstTag(tags, ...names) {
    for (const name of names) { const vals = tagValues(tags, name); if (vals.length) return vals[0]; }
    return undefined;
}
function parsePositiveNumber(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const n = Number(raw); return Number.isFinite(n) ? n : NaN;
}
function stripWheelTags(text) {
    return String(text || '')
        .replace(/\[(?:wheel|once|keep|repeat)\]/gi, '')
        .replace(/\[(?:id|weight|level|min|max|minlevel|maxlevel|cooldown)\s*=\s*[^\]]+\]/gi, '')
        .replace(/\s{2,}/g, ' ').trim();
}

function parseLorebookEntry(raw, bookName) {
    const keys = Array.isArray(raw?.key) ? raw.key.join(' ') : String(raw?.key ?? '');
    const comment = String(raw?.comment ?? '');
    const tags = extractBracketTags(`${comment} ${keys}`);
    const issues = [];
    const tagged = tags.some(t => t.name === 'wheel');
    const once = tags.some(t => t.name === 'once');
    const explicitKeep = tags.some(t => ['keep', 'repeat'].includes(t.name));

    for (const name of ['id', 'weight', 'level', 'min', 'minlevel', 'max', 'maxlevel', 'cooldown']) {
        if (tagValues(tags, name).length > 1) issues.push({ severity: 'error', message: `Duplicate [${name}=...] tag.` });
    }

    const idRaw = firstTag(tags, 'id');
    if (idRaw !== undefined && !VALID_ID_RE.test(String(idRaw))) issues.push({ severity: 'error', message: '[id=...] must be 1–80 characters using letters, numbers, _, ., :, or -.' });
    const fallbackId = raw?.uid !== undefined && raw?.uid !== null ? `uid-${raw.uid}` : `title-${stripWheelTags(comment).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}`;
    const stableId = String(idRaw || fallbackId || makeId());

    const weightRaw = parsePositiveNumber(firstTag(tags, 'weight'));
    const levelRaw = parsePositiveNumber(firstTag(tags, 'level'));
    const minRaw = parsePositiveNumber(firstTag(tags, 'min', 'minlevel'));
    const maxRaw = parsePositiveNumber(firstTag(tags, 'max', 'maxlevel'));
    const cooldownRaw = parsePositiveNumber(firstTag(tags, 'cooldown'));

    if (Number.isNaN(weightRaw) || (weightRaw !== null && (weightRaw <= 0 || weightRaw > 1000))) issues.push({ severity: 'error', message: '[weight] must be a number > 0 and ≤ 1000.' });
    if (Number.isNaN(levelRaw) || (levelRaw !== null && (!Number.isInteger(levelRaw) || levelRaw < 1 || levelRaw > 99))) issues.push({ severity: 'error', message: '[level] must be an integer from 1 to 99.' });
    if (Number.isNaN(minRaw) || (minRaw !== null && (!Number.isInteger(minRaw) || minRaw < 1 || minRaw > 99))) issues.push({ severity: 'error', message: '[min] must be an integer from 1 to 99.' });
    if (Number.isNaN(maxRaw) || (maxRaw !== null && (!Number.isInteger(maxRaw) || maxRaw < 1 || maxRaw > 99))) issues.push({ severity: 'error', message: '[max] must be an integer from 1 to 99.' });
    if (Number.isNaN(cooldownRaw) || (cooldownRaw !== null && (!Number.isInteger(cooldownRaw) || cooldownRaw < 0 || cooldownRaw > 99))) issues.push({ severity: 'error', message: '[cooldown] must be an integer from 0 to 99.' });
    if (levelRaw !== null && (minRaw !== null || maxRaw !== null)) issues.push({ severity: 'error', message: 'Use either [level=N] OR [min=N]/[max=N], not both.' });

    const minLevel = levelRaw ?? minRaw ?? 1;
    const maxLevel = levelRaw ?? maxRaw ?? 99;
    if (Number.isFinite(minLevel) && Number.isFinite(maxLevel) && minLevel > maxLevel) issues.push({ severity: 'error', message: 'Minimum level cannot be greater than maximum level.' });
    if (Number.isFinite(minLevel) && minLevel > getState().maxLevel) issues.push({ severity: 'warning', message: `Minimum level ${minLevel} is above the addon's configured maximum level ${getState().maxLevel}; this entry will never appear.` });
    if (once && cooldownRaw > 0) issues.push({ severity: 'warning', message: '[once] makes [cooldown] irrelevant; cooldown will be ignored.' });
    if (once && explicitKeep) issues.push({ severity: 'error', message: '[once] conflicts with [keep]/[repeat]. Choose one persistence policy.' });

    const title = stripWheelTags(comment || (Array.isArray(raw?.key) ? raw.key[0] : raw?.key) || `Lorebook entry ${raw?.uid ?? ''}`);
    if (!title) issues.push({ severity: 'error', message: 'Wheel entry has no visible title after metadata is removed.' });
    if (title.length > 48) issues.push({ severity: 'warning', message: `Title is ${title.length} characters; keep wheel labels below ~48 characters for readability.` });
    const description = String(raw?.content ?? '').trim();
    if (!description) issues.push({ severity: 'warning', message: 'Content/instruction is empty.' });
    if (!idRaw) issues.push({ severity: 'info', message: `No explicit [id=...] tag. SillyTavern UID ${raw?.uid ?? 'fallback'} will be used; explicit IDs are safer for exported/shared packs.` });

    const sourceId = `lorebook:${bookName}:${stableId}`;
    return {
        raw,
        issues,
        entry: normalizeEntry({
            id: sourceId,
            stableId,
            sourceId,
            title,
            description,
            tagged,
            once,
            weight: weightRaw && !Number.isNaN(weightRaw) ? weightRaw : 1,
            minLevel: Number.isFinite(minLevel) ? minLevel : 1,
            maxLevel: Number.isFinite(maxLevel) ? maxLevel : 99,
            cooldown: once ? 0 : (Number.isFinite(cooldownRaw) ? cooldownRaw : 0),
        }),
    };
}

async function analyzeLorebook() {
    const s = getState();
    if (!s.lorebook) return { bookName: '', parsed: [], issues: [{ severity: 'error', message: 'No Lorebook selected.' }], counts: {} };
    const book = await getContext().loadWorldInfo(s.lorebook);
    const rawEntries = Object.values(book?.entries ?? {}).filter(e => e && !e.disable);
    const parsed = rawEntries.map(e => parseLorebookEntry(e, s.lorebook)).filter(p => s.lorebookMode === 'all' || p.entry.tagged);
    const seen = new Map();
    for (const p of parsed) {
        const prior = seen.get(p.entry.sourceId);
        if (prior) {
            p.issues.push({ severity: 'error', message: `Duplicate stable wheel ID "${p.entry.stableId}".` });
            prior.issues.push({ severity: 'error', message: `Duplicate stable wheel ID "${p.entry.stableId}".` });
        } else seen.set(p.entry.sourceId, p);
    }
    const issues = parsed.flatMap(p => p.issues.map(i => ({ ...i, title: p.entry.title || `UID ${p.raw?.uid ?? '?'}`, stableId: p.entry.stableId })));
    const counts = {};
    for (let level = 1; level <= s.maxLevel; level++) {
        counts[level] = parsed.filter(p => !p.issues.some(i => i.severity === 'error') && level >= p.entry.minLevel && level <= p.entry.maxLevel).length;
    }
    return { bookName: s.lorebook, parsed, issues, counts };
}

function validationSignature(analysis) {
    return JSON.stringify(analysis.issues.filter(i => i.severity === 'error').map(i => [i.stableId, i.message]));
}
async function getLorebookEntries() {
    try {
        const analysis = await analyzeLorebook();
        const signature = validationSignature(analysis);
        if (signature !== '[]' && signature !== lastValidationSignature) {
            lastValidationSignature = signature;
            toastr.warning('Some Lorebook wheel entries are invalid and were skipped. Use “Validate & preview Lorebook”.', 'Wheel of Fortune');
        }
        return analysis.parsed
            .filter(p => !p.issues.some(i => i.severity === 'error'))
            .map(p => p.entry)
            .filter(e => !isRemoved(e.sourceId));
    } catch (error) {
        console.error('[Wheel of Fortune] Failed to load Lorebook', error);
        toastr.error(`Could not load Lorebook “${getState().lorebook}”.`, 'Wheel of Fortune');
        return [];
    }
}

function levelEligible(entry, level) { return level >= Number(entry.minLevel || 1) && level <= Number(entry.maxLevel || 99); }
function cooldownRemaining(entry) {
    const until = Number(getCooldownMap()[entry.sourceId] || 0); return Math.max(0, until - getProgress().spins);
}
async function resolveEntries(options = {}) {
    const s = getState(); const level = getActiveLevel(options.level);
    const all = s.source === 'lorebook' ? await getLorebookEntries() : normalizeManualEntries();
    const base = all.filter(e => clampWeight(e.weight) > 0 && !isRemoved(e.sourceId) && levelEligible(e, level));
    const ready = base.filter(e => cooldownRemaining(e) <= 0);
    if (ready.length) return ready;
    if (!base.length) return [];

    const minRemaining = Math.min(...base.map(cooldownRemaining));
    const released = base.filter(e => cooldownRemaining(e) === minRemaining);
    console.warn(`[Wheel of Fortune] Cooldown deadlock guard released ${released.length} earliest entry/entries (${minRemaining} spin(s) early).`);
    return released;
}

function weightedPick(entries) {
    const total = entries.reduce((sum, e) => sum + clampWeight(e.weight), 0);
    let cursor = Math.random() * total;
    for (let i = 0; i < entries.length; i++) { cursor -= clampWeight(entries[i].weight); if (cursor <= 0) return { entry: entries[i], index: i }; }
    return { entry: entries.at(-1), index: entries.length - 1 };
}

function customColors() { return String(getState().segmentColors || '').split(',').map(x => x.trim()).filter(Boolean); }
function palette(index, total) {
    const s = getState();
    const themes = {
        classic: ['#d7263d', '#f49d37', '#f9dc5c', '#3bb273', '#2b9eb3', '#4d7cff', '#7b5cff', '#c149d8'],
        pastel: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'],
        ocean: ['#023e8a', '#0077b6', '#0096c7', '#00b4d8', '#48cae4', '#90e0ef', '#4ea8de', '#5390d9'],
        fire: ['#7f0000', '#b71c1c', '#e65100', '#ef6c00', '#f9a825', '#fdd835', '#ff7043', '#c62828'],
        mono: ['#20242e', '#343b49', '#495264', '#5f6a7d', '#737f94', '#8a96ab', '#a4afc0', '#c2cad6'],
    };
    if (s.wheelTheme === 'custom') { const colors = customColors(); if (colors.length) return colors[index % colors.length]; }
    if (themes[s.wheelTheme]) return themes[s.wheelTheme][index % themes[s.wheelTheme].length];
    const hue = (265 + index * (300 / Math.max(total, 1))) % 360;
    return `hsl(${hue} 72% ${index % 2 ? 53 : 60}%)`;
}
function fitLabel(text, max = 23) { const clean = String(text).trim(); return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean; }

function applyAppearance() {
    const s = getState(); const root = overlay || document.getElementById('wof-overlay');
    if (root) { root.style.setProperty('--wof-accent', s.accentColor || '#7b54ff'); root.style.setProperty('--wof-pointer', s.pointerColor || '#fff3b0'); root.style.setProperty('--wof-text', s.textColor || '#ffffff'); }
    document.querySelector('#wof-overlay .wof-wheel-wrap')?.style.setProperty('--wof-wheel-size', `${clampNumber(s.wheelSize, 300, 760, 520)}px`);
    const title = document.getElementById('wof-overlay-title'); if (title) title.textContent = s.wheelTitle || 'Wheel of Fortune';
    syncFloatingButton();
}
function drawWheel(entries, concealLabels = false) {
    if (!ctx2d || !canvas) return;
    const s = getState(); const rect = canvas.getBoundingClientRect();
    const cssSize = Math.max(280, Math.floor(rect.width || clampNumber(s.wheelSize, 300, 760, 520)));
    const dpr = Math.min(window.devicePixelRatio || 1, 2); const size = Math.max(420, Math.floor(cssSize * dpr));
    if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; }
    const c = size / 2, radius = c - 10; ctx2d.clearRect(0, 0, size, size);
    const total = entries.reduce((sum, e) => sum + clampWeight(e.weight), 0) || 1; let angle = -Math.PI / 2;
    entries.forEach((entry, index) => {
        const weight = clampWeight(entry.weight), slice = (weight / total) * Math.PI * 2;
        ctx2d.beginPath(); ctx2d.moveTo(c, c); ctx2d.arc(c, c, radius, angle, angle + slice); ctx2d.closePath();
        ctx2d.fillStyle = palette(index, entries.length); ctx2d.fill(); ctx2d.strokeStyle = 'rgba(255,255,255,.42)'; ctx2d.lineWidth = Math.max(2, size / 250); ctx2d.stroke();
        const middle = angle + slice / 2; ctx2d.save(); ctx2d.translate(c, c); ctx2d.rotate(middle); ctx2d.textAlign = 'right'; ctx2d.textBaseline = 'middle'; ctx2d.fillStyle = s.textColor || '#fff'; ctx2d.shadowColor = 'rgba(0,0,0,.62)'; ctx2d.shadowBlur = 5; ctx2d.font = `700 ${Math.max(12, size / 35)}px system-ui, sans-serif`;
        const pct = Math.round((weight / total) * 100), label = concealLabels ? '???' : `${fitLabel(entry.title)}${s.showWeights ? ` · ${pct}%` : ''}`; ctx2d.fillText(label, radius * .9, 0); ctx2d.restore(); angle += slice;
    });
    ctx2d.beginPath(); ctx2d.arc(c, c, radius, 0, Math.PI * 2); ctx2d.strokeStyle = 'rgba(255,255,255,.82)'; ctx2d.lineWidth = Math.max(5, size / 85); ctx2d.stroke();
}
function segmentCenterDegrees(entries, chosenIndex) {
    const total = entries.reduce((sum, e) => sum + clampWeight(e.weight), 0); let start = -90;
    for (let i = 0; i < entries.length; i++) { const degrees = clampWeight(entries[i].weight) / total * 360; if (i === chosenIndex) return start + degrees / 2; start += degrees; }
    return -90;
}

function buildOverlay() {
    if (document.getElementById('wof-overlay')) { overlay = document.getElementById('wof-overlay'); canvas = document.getElementById('wof-canvas'); ctx2d = canvas?.getContext('2d'); applyAppearance(); return; }
    document.body.insertAdjacentHTML('beforeend', `
    <div id="wof-overlay" class="wof-overlay" aria-hidden="true"><div class="wof-shell">
      <div class="wof-topbar"><div class="wof-brand"><div class="wof-brand-icon">🎡</div><div><div class="wof-title" id="wof-overlay-title">Wheel of Fortune</div><div class="wof-subtitle" id="wof-source-label">Weighted roleplay forfeits</div></div></div><div class="wof-level-badge" id="wof-level-badge">Level 1</div><button id="wof-close" class="wof-close" title="Close">✕</button></div>
      <div id="wof-stage" class="wof-stage"><div class="wof-wheel-wrap"><div class="wof-pointer"></div><canvas id="wof-canvas" class="wof-canvas"></canvas><button id="wof-center" class="wof-center" type="button"><b>SPIN</b><span>the wheel</span></button></div></div>
      <div id="wof-suspense" class="wof-suspense">The wheel has stopped…</div>
      <div id="wof-result" class="wof-result"><div class="wof-result-label">The wheel chose</div><div id="wof-result-title" class="wof-result-title"></div><div id="wof-result-body" class="wof-result-body"></div></div>
      <div class="wof-actions"><button id="wof-spin-again" class="wof-action wof-action-primary">🎲 Spin again</button><button id="wof-close-bottom" class="wof-action">Close</button></div>
      <details class="wof-history"><summary>Recent spins</summary><div id="wof-history-list" class="wof-history-list"></div></details>
    </div></div>`);
    overlay = document.getElementById('wof-overlay'); canvas = document.getElementById('wof-canvas'); ctx2d = canvas?.getContext('2d');
    document.getElementById('wof-close')?.addEventListener('click', closeWheel); document.getElementById('wof-close-bottom')?.addEventListener('click', closeWheel); document.getElementById('wof-center')?.addEventListener('click', () => spinWheel()); document.getElementById('wof-spin-again')?.addEventListener('click', () => spinWheel());
    overlay?.addEventListener('click', e => { if (e.target === overlay && !spinning) closeWheel(); }); window.addEventListener('resize', () => drawWheel(currentEntries, hideWheelFor(getState().visibilityMode))); applyAppearance();
}
function syncFloatingButton() {
    if (!state) return; let button = document.getElementById('wof-floating-button');
    if (state.floatingButton) { if (!button) { button = document.createElement('button'); button.id = 'wof-floating-button'; button.type = 'button'; button.className = 'wof-floating-button'; button.title = 'Open Wheel of Fortune'; button.innerHTML = '🎡'; button.addEventListener('click', () => openWheel()); document.body.appendChild(button); } button.style.setProperty('--wof-accent', state.accentColor || '#7b54ff'); } else button?.remove();
}
function renderHistory() {
    const host = document.getElementById('wof-history-list'); if (!host) return;
    host.innerHTML = getState().history.slice(0, 10).map(h => `<div class="wof-history-item"><span>${h.secret ? '🤫 Hidden result' : esc(h.title)}</span><span>${esc(h.time)}</span></div>`).join('') || '<div>No spins yet.</div>';
}
function renderProgressUi() {
    if (!state) return; const p = getProgress(); const label = document.getElementById('wof-progress-label'); if (label) label.textContent = `Level ${p.level} · ${p.spins} completed spin${p.spins === 1 ? '' : 's'}`; const input = document.getElementById('wof-current-level'); if (input) input.value = p.level;
}

async function openWheel(options = {}) {
    const s = getState(); buildOverlay(); applyAppearance(); const visibility = normalizeVisibility(options.visibility ?? s.visibilityMode); const level = getActiveLevel(options.level); currentEntries = await resolveEntries({ level });
    if (!currentEntries.length) { toastr.warning(`No eligible forfeits at level ${level}. Validate the Lorebook or check level ranges.`, 'Wheel of Fortune'); return false; }
    overlay.dataset.visibility = visibility; overlay.classList.toggle('wof-hidden-wheel', hideWheelFor(visibility)); overlay.classList.toggle('wof-hidden-result', hideResultFor(visibility)); overlay.classList.add('wof-open'); overlay.setAttribute('aria-hidden', 'false');
    document.getElementById('wof-result')?.classList.remove('wof-show', 'wof-result-secret'); document.getElementById('wof-suspense')?.classList.remove('wof-show');
    const sourceLabel = document.getElementById('wof-source-label'); if (sourceLabel) sourceLabel.textContent = s.source === 'lorebook' ? `Lorebook: ${s.lorebook || 'not selected'} · ${currentEntries.length} eligible` : `${currentEntries.length} eligible weighted forfeits`;
    const badge = document.getElementById('wof-level-badge'); if (badge) badge.textContent = `Level ${level}`; drawWheel(currentEntries, hideWheelFor(visibility)); renderHistory(); return true;
}
function closeWheel() { if (!overlay || spinning) return; overlay.classList.remove('wof-open'); overlay.setAttribute('aria-hidden', 'true'); }
function formatResult(entry) { return `🎡 ${getState().wheelTitle || 'Wheel of Fortune'} — ${entry.title}${entry.description ? `\n${entry.description}` : ''}`; }
function clearInjectedPrompt() { try { getContext().setExtensionPrompt(PROMPT_KEY, '', extension_prompt_types.NONE, 0); } catch (error) { console.warn('[Wheel of Fortune] Could not clear injected prompt', error); } }
async function deliverResult(entry, requestedMode, visibility) {
    const s = getState(), context = getContext(), secret = hideResultFor(visibility); let mode = requestedMode || s.resultMode; if (secret) mode = s.secretResultToCharacter ? 'prompt' : 'private';
    if (mode === 'system') { context.sendSystemMessage('generic', formatResult(entry), { wof_result: true }); await context.saveChat?.(); }
    else if (mode === 'prompt') { context.setExtensionPrompt(PROMPT_KEY, `A Wheel of Fortune spin selected a roleplay forfeit. The user may not be allowed to see the result. Treat it as authoritative, incorporate it naturally, and do not reveal hidden wheel information unless permitted:\n\n${entry.title}\n${entry.description}`, extension_prompt_types.IN_CHAT, 0); clearTimeout(promptTimeout); promptTimeout = setTimeout(clearInjectedPrompt, 180000); if (!secret) toastr.success('Result silently injected into the next generation.', 'Wheel of Fortune'); }
    else if (!secret) toastr.info('Result kept in the wheel UI only.', 'Wheel of Fortune');
}
function calculateRotation(entries, index) {
    const s = getState(), centerDeg = segmentCenterDegrees(entries, index), normalizedCurrent = ((currentRotation % 360) + 360) % 360, targetMod = ((-90 - centerDeg) % 360 + 360) % 360; let delta = ((targetMod - normalizedCurrent) % 360 + 360) % 360, direction = s.spinDirection; if (direction === 'random') direction = Math.random() < .5 ? 'clockwise' : 'counterclockwise'; const turns = 11 + Math.floor(Math.random() * 6); if (direction === 'counterclockwise') { if (delta !== 0) delta -= 360; return currentRotation - 360 * turns + delta; } return currentRotation + 360 * turns + delta;
}
async function spinWheel(options = {}) {
    if (spinning) return ''; const s = getState(), visibility = normalizeVisibility(options.visibility ?? (options.hidden === true ? 'hidden-wheel' : s.visibilityMode)), level = getActiveLevel(options.level); const opened = overlay?.classList.contains('wof-open') || await openWheel({ ...options, visibility, level }); if (!opened) return '';
    currentEntries = await resolveEntries({ level }); if (!currentEntries.length) return ''; spinning = true;
    const center = document.getElementById('wof-center'), resultBox = document.getElementById('wof-result'), suspense = document.getElementById('wof-suspense'); center?.classList.add('wof-disabled'); resultBox?.classList.remove('wof-show', 'wof-result-secret'); suspense?.classList.remove('wof-show'); overlay.classList.toggle('wof-hidden-wheel', hideWheelFor(visibility)); overlay.classList.toggle('wof-hidden-result', hideResultFor(visibility)); drawWheel(currentEntries, hideWheelFor(visibility));
    const { entry, index } = weightedPick(currentEntries); currentRotation = calculateRotation(currentEntries, index); const seconds = clampNumber(options.seconds ?? s.spinSeconds, 4, 30, 10.5); canvas.style.transition = `transform ${seconds}s cubic-bezier(.06,.68,.05,1)`; requestAnimationFrame(() => { canvas.style.transform = `rotate(${currentRotation}deg)`; }); await new Promise(r => setTimeout(r, seconds * 1000 + 100)); suspense?.classList.add('wof-show'); const delay = clampNumber(options.revealDelay ?? s.revealDelay, 0, 5, 1.4); if (delay) await new Promise(r => setTimeout(r, delay * 1000)); suspense?.classList.remove('wof-show'); spinning = false; center?.classList.remove('wof-disabled');
    const secret = hideResultFor(visibility), titleEl = document.getElementById('wof-result-title'), bodyEl = document.getElementById('wof-result-body'); if (secret) { if (titleEl) titleEl.textContent = '🤫 Result hidden'; if (bodyEl) bodyEl.textContent = s.secretResultToCharacter ? 'The selected forfeit was sent privately to the character/AI.' : 'The selected forfeit remains private and was not sent to the character.'; resultBox?.classList.add('wof-result-secret'); } else { if (titleEl) titleEl.textContent = entry.title; if (bodyEl) bodyEl.textContent = entry.description || ''; } resultBox?.classList.add('wof-show');
    state.history.unshift({ title: entry.title, time: new Date().toLocaleString(), source: state.source, level, secret }); state.history = state.history.slice(0, 30); if (state.removeOnce && entry.once) markRemoved(entry.sourceId); advanceProgress(entry); renderHistory(); await deliverResult(entry, options.result || options.mode || state.resultMode, visibility); if (state.autoClose) setTimeout(closeWheel, 1600); return secret ? '[hidden result]' : entry.title;
}

function renderManualEntries() {
    const host = document.getElementById('wof-entry-list'); if (!host) return;
    host.innerHTML = getState().entries.map((entry, index) => `<div class="wof-entry" data-index="${index}"><input class="text_pole wof-entry-title" value="${esc(entry.title)}" title="Forfeit title" placeholder="Forfeit"><input class="text_pole wof-entry-weight" type="number" min="0.1" step="0.1" value="${esc(entry.weight)}" title="Weight"><input class="text_pole wof-entry-min" type="number" min="1" max="99" value="${esc(entry.minLevel)}" title="Minimum level"><input class="text_pole wof-entry-max" type="number" min="1" max="99" value="${esc(entry.maxLevel)}" title="Maximum level"><input class="text_pole wof-entry-cooldown" type="number" min="0" max="99" value="${esc(entry.cooldown)}" title="Cooldown"><button class="menu_button wof-entry-once" title="Remove permanently after selection">${entry.once ? '1×' : '∞'}</button><button class="menu_button wof-entry-delete" title="Delete">✕</button><textarea class="text_pole wof-entry-description" rows="2" placeholder="Description / instruction">${esc(entry.description)}</textarea></div>`).join('');
    host.querySelectorAll('.wof-entry').forEach(row => { const index = Number(row.dataset.index), update = () => { state.entries[index] = normalizeEntry(state.entries[index]); persist(); }; row.querySelector('.wof-entry-title')?.addEventListener('input', e => { state.entries[index].title = e.target.value; persist(); }); row.querySelector('.wof-entry-weight')?.addEventListener('input', e => { state.entries[index].weight = clampWeight(e.target.value); persist(); }); row.querySelector('.wof-entry-min')?.addEventListener('input', e => { state.entries[index].minLevel = e.target.value; update(); }); row.querySelector('.wof-entry-max')?.addEventListener('input', e => { state.entries[index].maxLevel = e.target.value; update(); }); row.querySelector('.wof-entry-cooldown')?.addEventListener('input', e => { state.entries[index].cooldown = e.target.value; update(); }); row.querySelector('.wof-entry-description')?.addEventListener('input', e => { state.entries[index].description = e.target.value; persist(); }); row.querySelector('.wof-entry-once')?.addEventListener('click', () => { state.entries[index].once = !state.entries[index].once; if (state.entries[index].once) state.entries[index].cooldown = 0; persist(); renderManualEntries(); }); row.querySelector('.wof-entry-delete')?.addEventListener('click', () => { state.entries.splice(index, 1); persist(); renderManualEntries(); }); });
}
function addManualEntry() { getState().entries.push(normalizeEntry({ id: makeId(), title: 'New forfeit', description: '', weight: 1, once: false, minLevel: 1, maxLevel: getState().maxLevel, cooldown: 0 })); persist(); renderManualEntries(); }
async function refreshLorebooks() { const select = document.getElementById('wof-lorebook'); if (!select) return; const names = getContext().getWorldInfoNames?.() ?? []; select.innerHTML = '<option value="">— Select a Lorebook —</option>' + names.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join(''); select.value = names.includes(getState().lorebook) ? state.lorebook : ''; }
function syncVisibility() { document.getElementById('wof-lorebook-options')?.toggleAttribute('hidden', getState().source !== 'lorebook'); document.getElementById('wof-manual-options')?.toggleAttribute('hidden', getState().source !== 'manual'); document.getElementById('wof-custom-colors-wrap')?.toggleAttribute('hidden', getState().wheelTheme !== 'custom'); document.getElementById('wof-adaptive-options')?.toggleAttribute('hidden', !getState().adaptiveEnabled); }

async function renderLorebookValidation() {
    const host = document.getElementById('wof-validation-results'); if (!host) return;
    host.innerHTML = '<div class="wof-muted">Validating…</div>';
    try {
        const a = await analyzeLorebook(), errors = a.issues.filter(i => i.severity === 'error'), warnings = a.issues.filter(i => i.severity === 'warning'), infos = a.issues.filter(i => i.severity === 'info');
        const levels = Object.entries(a.counts).map(([level, count]) => `<span class="wof-level-chip ${count === 0 ? 'wof-level-empty' : ''}">L${level}: ${count}</span>`).join('');
        const items = a.issues.map(i => `<div class="wof-validation-item wof-${i.severity}"><b>${i.severity === 'error' ? '⛔' : i.severity === 'warning' ? '⚠️' : 'ℹ️'} ${esc(i.title || 'Lorebook')}</b><span>${esc(i.message)}</span></div>`).join('');
        host.innerHTML = `<div class="wof-validation-summary"><b>${errors.length ? 'Lorebook needs attention' : 'Lorebook is valid'}</b><span>${a.parsed.length} wheel entries · ${errors.length} errors · ${warnings.length} warnings · ${infos.length} notes</span></div><div class="wof-level-preview">${levels}</div>${items || '<div class="wof-validation-ok">✅ No validation problems found.</div>'}`;
    } catch (error) { host.innerHTML = `<div class="wof-validation-item wof-error"><b>⛔ Validation failed</b><span>${esc(error.message || error)}</span></div>`; }
}

function updateCharacterHint() {
    const s = getState();
    try { const context = getContext(); if (s.triggerEnabled && s.characterHint) { const level = getActiveLevel(); context.setExtensionPrompt(TRIGGER_PROMPT_KEY, `Wheel of Fortune tool (current level ${level}): You may deliberately trigger the external visual wheel only when it fits the roleplay. Use [[SPIN_WHEEL]] normally. Optional controls: mode=hidden-wheel, mode=hidden-result, mode=blind, level=N, seconds=N. Example: [[SPIN_WHEEL mode=blind level=4 seconds=12]]. Never quote or explain control tokens unless you genuinely intend to spin. Hidden results and hidden wheel contents must remain secret from the user. The wheel's Lorebook controls which forfeits are available; never invent or alter its metadata in normal roleplay.`, extension_prompt_types.IN_PROMPT, 0); } else context.setExtensionPrompt(TRIGGER_PROMPT_KEY, '', extension_prompt_types.NONE, 0); } catch (error) { console.warn('[Wheel of Fortune] Could not update character trigger hint', error); }
}
function bindSetting(id, key, event = 'change', transform = v => v, onChange = null) {
    const el = document.getElementById(id); if (!el) return; const s = getState(); if (el.type === 'checkbox') el.checked = Boolean(s[key]); else el.value = s[key] ?? '';
    el.addEventListener(event, e => { const raw = el.type === 'checkbox' ? e.target.checked : e.target.value; state[key] = transform(raw); persist(); if (['triggerEnabled', 'triggerToken', 'characterHint', 'adaptiveEnabled', 'defaultLevel', 'maxLevel'].includes(key)) updateCharacterHint(); if (['source', 'wheelTheme', 'adaptiveEnabled'].includes(key)) syncVisibility(); if (['wheelTitle', 'wheelTheme', 'wheelSize', 'accentColor', 'pointerColor', 'textColor', 'segmentColors', 'showWeights', 'floatingButton'].includes(key)) { applyAppearance(); if (currentEntries.length) drawWheel(currentEntries, hideWheelFor(state.visibilityMode)); } if (['defaultLevel', 'maxLevel'].includes(key)) renderProgressUi(); onChange?.(state[key]); });
}
async function bindSettingsUi() {
    const settingsHtml = await renderExtensionTemplateAsync('third-party/WheelofFortune', 'settings'), container = document.getElementById('extensions_settings'); if (!container) throw new Error('SillyTavern extension settings container was not found.'); if (!document.getElementById('wof-settings')) container.insertAdjacentHTML('beforeend', settingsHtml);
    bindSetting('wof-trigger-enabled', 'triggerEnabled'); bindSetting('wof-trigger-token', 'triggerToken', 'input', String); bindSetting('wof-trigger-user', 'triggerUser'); bindSetting('wof-character-hint', 'characterHint'); bindSetting('wof-visibility-mode', 'visibilityMode', 'change', normalizeVisibility); bindSetting('wof-result-mode', 'resultMode'); bindSetting('wof-secret-to-character', 'secretResultToCharacter'); bindSetting('wof-auto-close', 'autoClose'); bindSetting('wof-source', 'source'); bindSetting('wof-lorebook-mode', 'lorebookMode', 'change', String, () => renderLorebookValidation()); bindSetting('wof-remove-once', 'removeOnce'); bindSetting('wof-spin-seconds', 'spinSeconds', 'input', v => clampNumber(v, 4, 30, 10.5)); bindSetting('wof-reveal-delay', 'revealDelay', 'input', v => clampNumber(v, 0, 5, 1.4)); bindSetting('wof-adaptive-enabled', 'adaptiveEnabled'); bindSetting('wof-default-level', 'defaultLevel', 'input', v => Math.round(clampNumber(v, 1, 10, 1))); bindSetting('wof-max-level', 'maxLevel', 'input', v => Math.round(clampNumber(v, 1, 10, 5)), () => renderLorebookValidation()); bindSetting('wof-auto-level-every', 'autoLevelEvery', 'input', v => Math.round(clampNumber(v, 0, 50, 3))); bindSetting('wof-wheel-title', 'wheelTitle', 'input', String); bindSetting('wof-wheel-theme', 'wheelTheme'); bindSetting('wof-wheel-size', 'wheelSize', 'input', v => clampNumber(v, 300, 760, 520)); bindSetting('wof-accent-color', 'accentColor', 'input', String); bindSetting('wof-pointer-color', 'pointerColor', 'input', String); bindSetting('wof-text-color', 'textColor', 'input', String); bindSetting('wof-segment-colors', 'segmentColors', 'input', String); bindSetting('wof-show-weights', 'showWeights'); bindSetting('wof-floating-button-enabled', 'floatingButton'); bindSetting('wof-spin-direction', 'spinDirection');
    document.getElementById('wof-open')?.addEventListener('click', () => openWheel()); document.getElementById('wof-spin-settings')?.addEventListener('click', () => spinWheel()); document.getElementById('wof-add-entry')?.addEventListener('click', addManualEntry); document.getElementById('wof-refresh-lorebooks')?.addEventListener('click', async () => { await refreshLorebooks(); await renderLorebookValidation(); }); document.getElementById('wof-validate-lorebook')?.addEventListener('click', renderLorebookValidation); document.getElementById('wof-lorebook')?.addEventListener('change', async e => { state.lorebook = e.target.value; persist(); await renderLorebookValidation(); }); document.getElementById('wof-current-level')?.addEventListener('change', e => setCurrentLevel(e.target.value)); document.getElementById('wof-level-down')?.addEventListener('click', () => setCurrentLevel(getProgress().level - 1)); document.getElementById('wof-level-up')?.addEventListener('click', () => setCurrentLevel(getProgress().level + 1)); document.getElementById('wof-reset-progress')?.addEventListener('click', resetChatProgress); document.getElementById('wof-reset')?.addEventListener('click', () => { if (!confirm('Reset Wheel of Fortune settings and entries to defaults?')) return; extension_settings[MODULE] = clone(defaults); state = null; ensureSettings(); location.reload(); });
    renderManualEntries(); renderProgressUi(); await refreshLorebooks(); syncVisibility(); applyAppearance();
}

function messageFingerprint(message, index) { return `${index}:${message?.is_user ? 'u' : 'a'}:${String(message?.mes ?? '')}`; }
function parseControlOptions(text) {
    const match = String(text || '').match(EXTENDED_TRIGGER_RE); if (!match) return null; const options = {}, args = String(match[1] || '');
    for (const item of args.matchAll(/([a-zA-Z][\w-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)/g)) { const key = item[1].toLowerCase(), value = item[2].replace(/^['\"]|['\"]$/g, ''); if (['mode', 'visibility'].includes(key)) options.visibility = normalizeVisibility(value); if (key === 'level') options.level = Number(value); if (['seconds', 'duration'].includes(key)) options.seconds = Number(value); if (['result', 'delivery'].includes(key)) options.result = String(value).toLowerCase(); }
    return options;
}
async function inspectLatestMessage({ allowUser = false } = {}) {
    const s = getState(); if (!s.triggerEnabled || spinning) return; const context = getContext(), index = context.chat.length - 1, message = context.chat[index]; if (!message || message.is_system) return; if (message.is_user && !(s.triggerUser && allowUser)) return; const text = String(message.mes ?? ''), extended = parseControlOptions(text), exactCustom = s.triggerToken && text.includes(s.triggerToken); if (!extended && !exactCustom) return; const fingerprint = messageFingerprint(message, index); if (fingerprint === lastTriggerFingerprint) return; lastTriggerFingerprint = fingerprint; await spinWheel(extended || {});
}

function registerCommands() {
    if (commandsRegistered) return;
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'wheel', aliases: ['spinwheel', 'wof'], callback: async args => spinWheel({ visibility: args.visibility || args.mode || (String(args.hidden).toLowerCase() === 'true' ? 'hidden-wheel' : undefined), level: args.level, seconds: args.seconds, result: args.result }), namedArgumentList: [SlashCommandNamedArgument.fromProps({ name: 'visibility', description: 'full, hidden-wheel, hidden-result, or blind', typeList: [ARGUMENT_TYPE.STRING] }), SlashCommandNamedArgument.fromProps({ name: 'mode', description: 'Alias for visibility', typeList: [ARGUMENT_TYPE.STRING] }), SlashCommandNamedArgument.fromProps({ name: 'hidden', description: 'Legacy: hide wheel labels', typeList: [ARGUMENT_TYPE.BOOLEAN] }), SlashCommandNamedArgument.fromProps({ name: 'level', description: 'Intensity level for this spin', typeList: [ARGUMENT_TYPE.NUMBER] }), SlashCommandNamedArgument.fromProps({ name: 'seconds', description: 'Spin duration', typeList: [ARGUMENT_TYPE.NUMBER] }), SlashCommandNamedArgument.fromProps({ name: 'result', description: 'system, prompt, or private', typeList: [ARGUMENT_TYPE.STRING] })], returns: 'selected forfeit title, or [hidden result]', helpString: '<div>Spin the animated wheel. Example: <code>/wheel visibility=blind level=4 seconds=12</code>.</div>' }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'wheel-open', aliases: ['wof-open'], callback: async args => { await openWheel({ visibility: args.visibility, level: args.level }); return ''; }, namedArgumentList: [SlashCommandNamedArgument.fromProps({ name: 'visibility', description: 'full, hidden-wheel, hidden-result, or blind', typeList: [ARGUMENT_TYPE.STRING] }), SlashCommandNamedArgument.fromProps({ name: 'level', description: 'Preview intensity level', typeList: [ARGUMENT_TYPE.NUMBER] })], helpString: 'Open the wheel without spinning.' }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'wheel-level', callback: async args => { if (args.level !== undefined) setCurrentLevel(args.level); return String(getProgress().level); }, namedArgumentList: [SlashCommandNamedArgument.fromProps({ name: 'level', description: 'Set current chat level', typeList: [ARGUMENT_TYPE.NUMBER] })], helpString: '<div>Get/set current chat wheel level.</div>' }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'wheel-validate', callback: async () => { const a = await analyzeLorebook(), errors = a.issues.filter(i => i.severity === 'error').length, warnings = a.issues.filter(i => i.severity === 'warning').length; await renderLorebookValidation(); toastr.info(`${a.parsed.length} entries · ${errors} errors · ${warnings} warnings`, 'Wheel Lorebook validation'); return `${errors} errors, ${warnings} warnings`; }, helpString: 'Validate the selected Wheel Lorebook and show level coverage.' }));
    commandsRegistered = true; console.info('[Wheel of Fortune] v1.3 commands registered');
}
try { registerCommands(); } catch (error) { console.error('[Wheel of Fortune] Slash command registration failed', error); }

jQuery(async () => {
    try {
        ensureSettings(); buildOverlay(); syncFloatingButton(); updateCharacterHint(); try { registerCommands(); } catch (error) { console.warn('[Wheel of Fortune] Deferred command registration failed', error); }
        try { await bindSettingsUi(); } catch (error) { console.error('[Wheel of Fortune] Settings UI failed. Commands remain available.', error); toastr.warning('Wheel loaded, but its settings panel could not be created. Check the console.', 'Wheel of Fortune'); }
        eventSource.on(event_types.MESSAGE_RECEIVED, () => inspectLatestMessage({ allowUser: false })); if (event_types.MESSAGE_SENT) eventSource.on(event_types.MESSAGE_SENT, () => inspectLatestMessage({ allowUser: true })); eventSource.on(event_types.CHAT_CHANGED, () => { lastTriggerFingerprint = ''; clearInjectedPrompt(); renderProgressUi(); updateCharacterHint(); });
        console.info('[Wheel of Fortune] Extension v1.3 loaded');
    } catch (error) { console.error('[Wheel of Fortune] Fatal initialization error', error); toastr.error('Wheel of Fortune failed to initialize. Open the browser console for details.', 'Wheel of Fortune'); }
});
