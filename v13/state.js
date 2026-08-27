import { eventSource, event_types, extension_prompt_types, saveSettingsDebounced } from '../../../../../script.js';
import { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../../extensions.js';

export { eventSource, event_types, extension_prompt_types, getContext, renderExtensionTemplateAsync };

export const MODULE = 'wheel-of-fortune';
export const PROMPT_KEY = 'WHEEL_OF_FORTUNE_RESULT';
export const TRIGGER_PROMPT_KEY = 'WHEEL_OF_FORTUNE_TRIGGER';
export const EXTENDED_TRIGGER_RE = /\[\[SPIN_WHEEL(?:\s+([^\]]+))?\]\]/i;

export function makeId() {
    try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* insecure origin */ }
    return `wof-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const defaults = {
    triggerEnabled: true,
    triggerToken: '[[SPIN_WHEEL]]',
    triggerUser: false,
    characterHint: true,
    visibilityMode: 'full',
    resultMode: 'system',
    secretResultToCharacter: true,
    autoClose: false,
    source: 'manual', // manual | lorebook | character
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
        { id: makeId(), title: 'Tell an embarrassing secret', description: 'Reveal an embarrassing but believable secret.', weight: 3, once: false, minLevel: 1, maxLevel: 5, cooldown: 0 },
        { id: makeId(), title: 'Truth or dare', description: 'Choose truth or dare and follow through.', weight: 3, once: false, minLevel: 1, maxLevel: 5, cooldown: 1 },
        { id: makeId(), title: 'Unexpected confession', description: 'Make an unexpected confession that fits the scene.', weight: 2, once: false, minLevel: 2, maxLevel: 5, cooldown: 1 },
        { id: makeId(), title: 'Role reversal', description: 'Reverse the usual social roles for the next scene beat.', weight: 2, once: false, minLevel: 2, maxLevel: 5, cooldown: 2 },
        { id: makeId(), title: 'Wildcard', description: 'Invent a surprising but story-compatible forfeit.', weight: 1, once: false, minLevel: 3, maxLevel: 5, cooldown: 2 },
        { id: makeId(), title: 'Lucky escape', description: 'No forfeit this time.', weight: 1, once: false, minLevel: 1, maxLevel: 5, cooldown: 1 },
    ],
    history: [],
};

export let state = null;

export function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function clampWeight(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 1;
}

export function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

export function normalizeVisibility(value) {
    const raw = String(value || '').toLowerCase().trim();
    const aliases = { hidden: 'hidden-wheel', mystery: 'hidden-wheel', secret: 'hidden-result', both: 'blind', allhidden: 'blind', 'all-hidden': 'blind' };
    const v = aliases[raw] || raw;
    return ['full', 'hidden-wheel', 'hidden-result', 'blind'].includes(v) ? v : 'full';
}

export function hideWheelFor(mode) { return ['hidden-wheel', 'blind'].includes(normalizeVisibility(mode)); }
export function hideResultFor(mode) { return ['hidden-result', 'blind'].includes(normalizeVisibility(mode)); }

export function normalizeEntry(entry) {
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

export function getChatKey() {
    try {
        const c = getContext();
        return String(c?.chatId || c?.groupId || c?.characterId || 'global');
    } catch { return 'global'; }
}

export function ensureSettings() {
    if (!extension_settings[MODULE]) extension_settings[MODULE] = {};
    const saved = extension_settings[MODULE];
    state = Object.assign({}, structuredClone(defaults), saved);
    if (!saved.visibilityMode && saved.hiddenSpin) state.visibilityMode = 'hidden-wheel';
    state.visibilityMode = normalizeVisibility(state.visibilityMode);
    state.spinSeconds = clampNumber(state.spinSeconds, 4, 30, 10.5);
    state.revealDelay = clampNumber(state.revealDelay, 0, 5, 1.4);
    state.defaultLevel = Math.round(clampNumber(state.defaultLevel, 1, 10, 1));
    state.maxLevel = Math.round(clampNumber(state.maxLevel, state.defaultLevel, 10, 5));
    state.autoLevelEvery = Math.round(clampNumber(state.autoLevelEvery, 0, 50, 3));
    state.entries = (Array.isArray(saved.entries) && saved.entries.length ? saved.entries : structuredClone(defaults.entries)).map(normalizeEntry);
    state.history = Array.isArray(saved.history) ? saved.history : [];
    state.progressByChat = saved.progressByChat && typeof saved.progressByChat === 'object' ? saved.progressByChat : {};
    state.cooldownsByChat = saved.cooldownsByChat && typeof saved.cooldownsByChat === 'object' ? saved.cooldownsByChat : {};
    state.removedIdsByChat = saved.removedIdsByChat && typeof saved.removedIdsByChat === 'object' ? saved.removedIdsByChat : {};

    // v1.2 migration: old global [once] removals are preserved only for the current chat.
    if (Array.isArray(saved.removedIds) && saved.removedIds.length && !state.removedIdsByChat[getChatKey()]) {
        state.removedIdsByChat[getChatKey()] = [...new Set(saved.removedIds.map(String))];
    }
    delete state.removedIds;
    extension_settings[MODULE] = state;
    saveSettingsDebounced();
    return state;
}

export function getState() { return state || ensureSettings(); }

export function persist() {
    if (!state) return;
    extension_settings[MODULE] = state;
    saveSettingsDebounced();
}

export function getProgress() {
    const s = getState();
    const key = getChatKey();
    if (!s.progressByChat[key]) s.progressByChat[key] = { level: s.defaultLevel, spins: 0 };
    const p = s.progressByChat[key];
    p.level = Math.round(clampNumber(p.level, 1, s.maxLevel, s.defaultLevel));
    p.spins = Math.max(0, Math.round(Number(p.spins) || 0));
    return p;
}

export function getCooldownMap() {
    const s = getState();
    const key = getChatKey();
    if (!s.cooldownsByChat[key]) s.cooldownsByChat[key] = {};
    return s.cooldownsByChat[key];
}

export function getRemovedIds() {
    const s = getState();
    const key = getChatKey();
    if (!Array.isArray(s.removedIdsByChat[key])) s.removedIdsByChat[key] = [];
    return s.removedIdsByChat[key];
}

export function isRemoved(id) { return Boolean(id) && getRemovedIds().includes(String(id)); }

export function markRemoved(id) {
    if (!id) return;
    const list = getRemovedIds();
    if (!list.includes(String(id))) list.push(String(id));
}

export function getActiveLevel(levelOverride) {
    const s = getState();
    if (levelOverride !== undefined && levelOverride !== null && levelOverride !== '') {
        return Math.round(clampNumber(levelOverride, 1, s.maxLevel, s.defaultLevel));
    }
    return s.adaptiveEnabled ? getProgress().level : s.defaultLevel;
}

export function setCurrentLevel(level) {
    const s = getState();
    getProgress().level = Math.round(clampNumber(level, 1, s.maxLevel, s.defaultLevel));
    persist();
    renderProgressUi();
    updateCharacterHint();
}

export function resetChatProgress() {
    const s = getState();
    const key = getChatKey();
    s.progressByChat[key] = { level: s.defaultLevel, spins: 0 };
    s.cooldownsByChat[key] = {};
    s.removedIdsByChat[key] = [];
    persist();
    renderProgressUi();
    updateCharacterHint();
    toastr.success('Level, cooldowns and one-shot removals reset for this chat.', 'Wheel of Fortune');
}

export function advanceProgress(entry) {
    const s = getState();
    const p = getProgress();
    p.spins += 1;
    if (entry?.sourceId && Number(entry.cooldown) > 0 && !entry.once) {
        getCooldownMap()[entry.sourceId] = p.spins + Number(entry.cooldown);
    }
    if (s.adaptiveEnabled && s.autoLevelEvery > 0 && p.spins % s.autoLevelEvery === 0 && p.level < s.maxLevel) {
        p.level += 1;
        toastr.info(`Wheel intensity increased to level ${p.level}.`, 'Wheel of Fortune');
    }
    persist();
    renderProgressUi();
    updateCharacterHint();
}

export function sourceLabel() {
    const s = getState();
    if (s.source === 'character') return 'Active character Lorebook';
    if (s.source === 'lorebook') return `Lorebook: ${s.lorebook || 'not selected'}`;
    return 'Manual entries';
}

export function renderProgressUi() {
    if (!state) return;
    const p = getProgress();
    const label = document.getElementById('wof-progress-label');
    if (label) label.textContent = `Level ${p.level} · ${p.spins} completed spin${p.spins === 1 ? '' : 's'} · ${getRemovedIds().length} one-shot removed`;
    const input = document.getElementById('wof-current-level');
    if (input) input.value = p.level;
}

export function updateCharacterHint() {
    const s = getState();
    try {
        const c = getContext();
        if (s.triggerEnabled && s.characterHint) {
            c.setExtensionPrompt(
                TRIGGER_PROMPT_KEY,
                `Wheel of Fortune tool (current level ${getActiveLevel()}): You may deliberately launch the external visual wheel only when it fits the roleplay. Normal: [[SPIN_WHEEL]]. Options include mode=hidden-wheel, mode=hidden-result, mode=blind, level=N and seconds=N, for example [[SPIN_WHEEL mode=blind level=4 seconds=12]]. Trigger tokens are control commands: never quote or explain them unless you genuinely intend to spin. A hidden result must remain secret from the user. Wheel Lorebook metadata, stable IDs, probabilities and internal levels are implementation details and must never be narrated.`,
                extension_prompt_types.IN_PROMPT,
                0,
            );
        } else {
            c.setExtensionPrompt(TRIGGER_PROMPT_KEY, '', extension_prompt_types.NONE, 0);
        }
    } catch (error) {
        console.warn('[Wheel of Fortune] Character hint failed', error);
    }
}
