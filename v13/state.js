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

function defaultEntries() {
    return [
        { id: makeId(), title: 'Tell an embarrassing secret', description: 'Reveal an embarrassing but believable secret.', weight: 3, once: false, minLevel: 1, maxLevel: 5, cooldown: 0 },
        { id: makeId(), title: 'Truth or dare', description: 'Choose truth or dare and follow through.', weight: 3, once: false, minLevel: 1, maxLevel: 5, cooldown: 1 },
        { id: makeId(), title: 'Unexpected confession', description: 'Make an unexpected confession that fits the scene.', weight: 2, once: false, minLevel: 2, maxLevel: 5, cooldown: 1 },
        { id: makeId(), title: 'Role reversal', description: 'Reverse the usual social roles for the next scene beat.', weight: 2, once: false, minLevel: 2, maxLevel: 5, cooldown: 2 },
        { id: makeId(), title: 'Wildcard', description: 'Invent a surprising but story-compatible forfeit.', weight: 1, once: false, minLevel: 3, maxLevel: 5, cooldown: 2 },
        { id: makeId(), title: 'Lucky escape', description: 'No forfeit this time.', weight: 1, once: false, minLevel: 1, maxLevel: 5, cooldown: 1 },
    ];
}

export const presetDefaults = {
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
    wheelTitle: 'Wheel of Fortune',
    wheelTheme: 'neon',
    wheelSize: 520,
    accentColor: '#7b54ff',
    pointerColor: '#fff3b0',
    textColor: '#ffffff',
    segmentColors: '#7c4dff, #e449d6, #ff5c8a, #ff9854, #ffd166, #52d6a8, #39b9ff, #5965ff',
    showWeights: false,
    audioEnabled: true,
    audioVolume: 0.35,
    pointerTicks: true,
    tickVolume: 0.75,
    tickStyle: 'classic', // classic | soft | wooden
    spinSound: true,
    resultSound: true,
    entries: defaultEntries(),
};

const PRESET_FIELDS = Object.freeze(Object.keys(presetDefaults));

export const defaults = {
    // Global extension behavior. These intentionally do not change when a wheel preset changes.
    triggerEnabled: true,
    triggerToken: '[[SPIN_WHEEL]]',
    triggerUser: false,
    characterHint: true,
    floatingButton: true,

    // Presets. Active preset values are mirrored onto the root state for compatibility with v1.3 modules.
    activePresetId: '',
    presets: [],

    // Per-preset + per-chat state maps.
    progressByChat: {},
    cooldownsByChat: {},
    removedIdsByChat: {},
    history: [],

    // Active preset mirror / v1.3 migration fields.
    ...presetDefaults,
    entries: defaultEntries(),
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

function normalizePresetConfig(config = {}) {
    const out = Object.assign({}, structuredClone(presetDefaults), config || {});
    out.visibilityMode = normalizeVisibility(out.visibilityMode);
    out.spinSeconds = clampNumber(out.spinSeconds, 4, 30, 10.5);
    out.revealDelay = clampNumber(out.revealDelay, 0, 5, 1.4);
    out.defaultLevel = Math.round(clampNumber(out.defaultLevel, 1, 10, 1));
    out.maxLevel = Math.round(clampNumber(out.maxLevel, out.defaultLevel, 10, 5));
    out.autoLevelEvery = Math.round(clampNumber(out.autoLevelEvery, 0, 50, 3));
    out.wheelSize = clampNumber(out.wheelSize, 300, 760, 520);
    out.audioVolume = clampNumber(out.audioVolume, 0, 1, 0.35);
    out.tickVolume = clampNumber(out.tickVolume, 0, 1, 0.75);
    out.tickStyle = ['classic', 'soft', 'wooden'].includes(String(out.tickStyle)) ? String(out.tickStyle) : 'classic';
    out.entries = (Array.isArray(out.entries) ? out.entries : defaultEntries()).map(normalizeEntry);
    return out;
}

function capturePresetConfig(source = state) {
    const config = {};
    for (const key of PRESET_FIELDS) config[key] = structuredClone(source?.[key] ?? presetDefaults[key]);
    return normalizePresetConfig(config);
}

function applyPresetConfig(config) {
    if (!state) return;
    const normalized = normalizePresetConfig(config);
    for (const key of PRESET_FIELDS) state[key] = structuredClone(normalized[key]);
}

function normalizePreset(raw, index = 0) {
    const name = String(raw?.name || `Wheel ${index + 1}`).trim().slice(0, 80) || `Wheel ${index + 1}`;
    return {
        id: String(raw?.id || makeId()),
        name,
        config: normalizePresetConfig(raw?.config || raw || {}),
    };
}

function syncRootToActivePreset() {
    if (!state || !Array.isArray(state.presets)) return;
    const preset = state.presets.find(p => p.id === state.activePresetId);
    if (preset) preset.config = capturePresetConfig(state);
}

export function getPresets() {
    const s = getState();
    return s.presets.map(p => ({ id: p.id, name: p.name }));
}

export function getActivePreset() {
    const s = getState();
    return s.presets.find(p => p.id === s.activePresetId) || s.presets[0] || null;
}

export function getActivePresetName() { return getActivePreset()?.name || 'Default'; }

export function resolvePreset(ref) {
    const s = getState();
    const raw = String(ref ?? '').trim();
    if (!raw) return getActivePreset();
    const lower = raw.toLowerCase();
    return s.presets.find(p => p.id === raw || p.name.toLowerCase() === lower) || null;
}

export function selectPreset(ref) {
    const s = getState();
    syncRootToActivePreset();
    const preset = resolvePreset(ref);
    if (!preset) return null;
    s.activePresetId = preset.id;
    applyPresetConfig(preset.config);
    persist();
    renderProgressUi();
    updateCharacterHint();
    return preset;
}

export function createPreset(name, { cloneCurrent = false } = {}) {
    const s = getState();
    syncRootToActivePreset();
    const cleanName = String(name || `Wheel ${s.presets.length + 1}`).trim().slice(0, 80) || `Wheel ${s.presets.length + 1}`;
    const base = cloneCurrent ? capturePresetConfig(s) : normalizePresetConfig({ wheelTitle: cleanName });
    const preset = { id: makeId(), name: cleanName, config: base };
    s.presets.push(preset);
    s.activePresetId = preset.id;
    applyPresetConfig(base);
    persist();
    updateCharacterHint();
    return preset;
}

export function renamePreset(ref, name) {
    const s = getState();
    const preset = resolvePreset(ref);
    if (!preset) return null;
    const cleanName = String(name || '').trim().slice(0, 80);
    if (!cleanName) return null;
    preset.name = cleanName;
    persist();
    updateCharacterHint();
    return preset;
}

export function deletePreset(ref) {
    const s = getState();
    if (s.presets.length <= 1) return false;
    syncRootToActivePreset();
    const preset = resolvePreset(ref);
    if (!preset) return false;
    const index = s.presets.findIndex(p => p.id === preset.id);
    s.presets.splice(index, 1);
    if (s.activePresetId === preset.id) {
        const replacement = s.presets[Math.min(index, s.presets.length - 1)] || s.presets[0];
        s.activePresetId = replacement.id;
        applyPresetConfig(replacement.config);
    }
    persist();
    renderProgressUi();
    updateCharacterHint();
    return true;
}

export function getChatKey() {
    try {
        const c = getContext();
        return String(c?.chatId || c?.groupId || c?.characterId || 'global');
    } catch { return 'global'; }
}

export function getPresetChatKey() {
    return `${getState().activePresetId || 'default'}::${getChatKey()}`;
}

function migrateLegacyScopedValue(map, scopedKey, factory) {
    if (map[scopedKey] !== undefined) return map[scopedKey];
    const legacyKey = getChatKey();
    const firstPreset = getState().presets[0]?.id;
    if (getState().activePresetId === firstPreset && map[legacyKey] !== undefined) {
        map[scopedKey] = structuredClone(map[legacyKey]);
        return map[scopedKey];
    }
    map[scopedKey] = factory();
    return map[scopedKey];
}

export function ensureSettings() {
    if (!extension_settings[MODULE]) extension_settings[MODULE] = {};
    const saved = extension_settings[MODULE];
    state = Object.assign({}, structuredClone(defaults), saved);

    // v1.1 migration.
    if (!saved.visibilityMode && saved.hiddenSpin) state.visibilityMode = 'hidden-wheel';

    // v1.4 preset migration. A v1.3 installation becomes the first named preset without losing configuration.
    if (Array.isArray(saved.presets) && saved.presets.length) {
        state.presets = saved.presets.map(normalizePreset);
    } else {
        const migrated = capturePresetConfig(state);
        state.presets = [{ id: makeId(), name: 'Default', config: migrated }];
    }
    if (!state.presets.some(p => p.id === state.activePresetId)) state.activePresetId = state.presets[0].id;
    const active = state.presets.find(p => p.id === state.activePresetId) || state.presets[0];
    applyPresetConfig(active.config);

    state.history = Array.isArray(saved.history) ? saved.history : [];
    state.progressByChat = saved.progressByChat && typeof saved.progressByChat === 'object' ? saved.progressByChat : {};
    state.cooldownsByChat = saved.cooldownsByChat && typeof saved.cooldownsByChat === 'object' ? saved.cooldownsByChat : {};
    state.removedIdsByChat = saved.removedIdsByChat && typeof saved.removedIdsByChat === 'object' ? saved.removedIdsByChat : {};

    // v1.2 migration: old global one-shot removals are preserved for the migrated first preset/current chat.
    if (Array.isArray(saved.removedIds) && saved.removedIds.length) {
        const key = getPresetChatKey();
        if (!state.removedIdsByChat[key]) state.removedIdsByChat[key] = [...new Set(saved.removedIds.map(String))];
    }
    delete state.removedIds;

    extension_settings[MODULE] = state;
    persist();
    return state;
}

export function getState() { return state || ensureSettings(); }

export function persist() {
    if (!state) return;
    syncRootToActivePreset();
    extension_settings[MODULE] = state;
    saveSettingsDebounced();
}

export function getProgress() {
    const s = getState();
    const key = getPresetChatKey();
    const p = migrateLegacyScopedValue(s.progressByChat, key, () => ({ level: s.defaultLevel, spins: 0 }));
    p.level = Math.round(clampNumber(p.level, 1, s.maxLevel, s.defaultLevel));
    p.spins = Math.max(0, Math.round(Number(p.spins) || 0));
    return p;
}

export function getCooldownMap() {
    const s = getState();
    const key = getPresetChatKey();
    return migrateLegacyScopedValue(s.cooldownsByChat, key, () => ({}));
}

export function getRemovedIds() {
    const s = getState();
    const key = getPresetChatKey();
    const value = migrateLegacyScopedValue(s.removedIdsByChat, key, () => []);
    if (!Array.isArray(value)) s.removedIdsByChat[key] = [];
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
    const key = getPresetChatKey();
    s.progressByChat[key] = { level: s.defaultLevel, spins: 0 };
    s.cooldownsByChat[key] = {};
    s.removedIdsByChat[key] = [];
    persist();
    renderProgressUi();
    updateCharacterHint();
    toastr.success(`Level, cooldowns and one-shot removals reset for “${getActivePresetName()}” in this chat.`, 'Wheel of Fortune');
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
        toastr.info(`“${getActivePresetName()}” intensity increased to level ${p.level}.`, 'Wheel of Fortune');
    }
    persist();
    renderProgressUi();
    updateCharacterHint();
}

export function sourceLabel() {
    const s = getState();
    const prefix = getActivePresetName();
    if (s.source === 'character') return `${prefix} · Active character Lorebook`;
    if (s.source === 'lorebook') return `${prefix} · Lorebook: ${s.lorebook || 'not selected'}`;
    return `${prefix} · Manual entries`;
}

export function renderProgressUi() {
    if (!state) return;
    const p = getProgress();
    const label = document.getElementById('wof-progress-label');
    if (label) label.textContent = `${getActivePresetName()} · Level ${p.level} · ${p.spins} completed spin${p.spins === 1 ? '' : 's'} · ${getRemovedIds().length} one-shot removed`;
    const input = document.getElementById('wof-current-level');
    if (input) input.value = p.level;
}

export function updateCharacterHint() {
    const s = getState();
    try {
        const c = getContext();
        if (s.triggerEnabled && s.characterHint) {
            const names = getPresets().map(p => `"${p.name}"`).join(', ');
            c.setExtensionPrompt(
                TRIGGER_PROMPT_KEY,
                `Wheel of Fortune tool (active preset "${getActivePresetName()}", current level ${getActiveLevel()}): You may deliberately launch the external visual wheel only when it fits the roleplay. Normal: [[SPIN_WHEEL]]. Optional controls include preset="Name", mode=hidden-wheel, mode=hidden-result, mode=blind, level=N and seconds=N. Example: [[SPIN_WHEEL preset="Secrets" mode=blind level=4 seconds=12]]. Available presets: ${names || 'none'}. Use only preset names that actually exist. Trigger tokens are control commands: never quote or explain them unless you genuinely intend to spin. A hidden result must remain secret from the user. Wheel Lorebook metadata, stable IDs, probabilities, preset routing and internal levels are implementation details and must never be narrated.`,
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
