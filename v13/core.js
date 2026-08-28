// Pure helpers used by the v1.5 runtime. Keep this module browser/API independent so it can be unit-tested with Node.

export const EXTENDED_TRIGGER_GLOBAL_RE = /\[\[SPIN_WHEEL(?:\s+([^\]]+))?\]\]/gi;
export const EXTENDED_TRIGGER_FIRST_RE = /\[\[SPIN_WHEEL(?:\s+([^\]]+))?\]\]/i;

const WHEEL_KEYWORD_META_RE = /^wof:(wheel|once|id|weight|level|min|max|minlevel|maxlevel|cooldown|preset)(?:\s*=\s*(.+))?$/i;

export function normalizeVisibilityValue(value) {
    const raw = String(value || '').toLowerCase().trim();
    const aliases = {
        hidden: 'hidden-wheel',
        mystery: 'hidden-wheel',
        secret: 'hidden-result',
        both: 'blind',
        allhidden: 'blind',
        'all-hidden': 'blind',
    };
    const normalized = aliases[raw] || raw;
    return ['full', 'hidden-wheel', 'hidden-result', 'blind'].includes(normalized) ? normalized : 'full';
}

export function parseControlOptions(text) {
    const match = String(text || '').match(EXTENDED_TRIGGER_FIRST_RE);
    if (!match) return null;
    const options = {};
    const args = String(match[1] || '');
    for (const item of args.matchAll(/([a-zA-Z][\w-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)/g)) {
        const key = item[1].toLowerCase();
        const value = item[2].replace(/^['"]|['"]$/g, '');
        if (['mode', 'visibility'].includes(key)) options.visibility = normalizeVisibilityValue(value);
        if (key === 'level') options.level = Number(value);
        if (['seconds', 'duration'].includes(key)) options.seconds = Number(value);
        if (['result', 'delivery'].includes(key)) options.result = String(value).toLowerCase();
        if (['preset', 'wheel'].includes(key)) options.preset = String(value);
    }
    return options;
}

/**
 * Parse Wheel of Fortune metadata stored in SillyTavern Primary Keywords.
 *
 * Recommended Character Book representation:
 *   WheelOfFortune
 *   wof:preset=Studio
 *   wof:id=studio_category_01
 *   wof:weight=5
 *   wof:min=1
 *   wof:max=5
 *   wof:cooldown=2
 *   wof:once
 *
 * This keeps the visible Name/Comment field human-readable while preserving a
 * portable, editable representation in the standard Character Book keys array.
 */
export function parseWheelKeywordMetadata(keys = []) {
    const values = Array.isArray(keys) ? keys : (keys == null ? [] : [keys]);
    const tags = {};
    const add = (name, value) => {
        if (!tags[name]) tags[name] = [];
        const normalized = value === true ? true : String(value).trim();
        if (!tags[name].some(existing => String(existing).toLowerCase() === String(normalized).toLowerCase())) {
            tags[name].push(normalized);
        }
    };

    for (const raw of values) {
        const token = String(raw ?? '').trim();
        if (!token) continue;
        const lower = token.toLowerCase();
        if (lower === 'wheeloffortune' || lower === 'wof' || lower === 'wof:wheel') {
            add('wheel', true);
            continue;
        }
        const match = token.match(WHEEL_KEYWORD_META_RE);
        if (!match) continue;
        const name = match[1].toLowerCase();
        const value = match[2] === undefined ? true : String(match[2]).trim();
        add(name, value);
    }
    return tags;
}

export function characterKeywordsDeclarePreset(keys, presetName) {
    const target = String(presetName ?? '').trim().replace(/^(?:"|')|(?:"|')$/g, '').toLowerCase();
    if (!target) return false;
    const tags = parseWheelKeywordMetadata(keys);
    if (!tags.wheel?.length) return false;
    return (tags.preset || [])
        .filter(value => value !== true)
        .flatMap(value => String(value).split(','))
        .map(value => value.trim().replace(/^(?:"|')|(?:"|')$/g, '').toLowerCase())
        .filter(Boolean)
        .includes(target);
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function countWheelTriggers(text, customToken = '') {
    const input = String(text || '');
    const extended = [...input.matchAll(EXTENDED_TRIGGER_GLOBAL_RE)].length;
    const token = String(customToken || '').trim();
    if (!token || /^\[\[SPIN_WHEEL(?:\s|\]\])/i.test(token)) return extended;
    const customMatches = input.match(new RegExp(escapeRegExp(token), 'g'));
    return extended + (customMatches?.length || 0);
}

export function stripWheelTriggerTokens(text, customToken = '') {
    let output = String(text || '').replace(EXTENDED_TRIGGER_GLOBAL_RE, '');
    const token = String(customToken || '').trim();
    if (token && !/^\[\[SPIN_WHEEL(?:\s|\]\])/i.test(token)) {
        output = output.replace(new RegExp(escapeRegExp(token), 'g'), '');
    }
    return output
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function shouldBlockCharacterTrigger({ locked = false, isUser = false } = {}) {
    return Boolean(locked && !isUser);
}

export function uniquePresetName(baseName, existingNames = []) {
    const base = String(baseName || 'Imported Wheel').trim().slice(0, 80) || 'Imported Wheel';
    const used = new Set(existingNames.map(name => String(name).toLowerCase()));
    if (!used.has(base.toLowerCase())) return base;
    for (let i = 2; i < 1000; i++) {
        const suffix = ` (${i})`;
        const candidate = `${base.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
        if (!used.has(candidate.toLowerCase())) return candidate;
    }
    return `Imported-${Date.now()}`;
}

export function validatePresetEnvelope(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { valid: false, error: 'Preset file must contain a JSON object.' };
    }
    if (value.format !== 'sillytavern-wheel-preset') {
        return { valid: false, error: 'Not a Wheel of Fortune preset export.' };
    }
    if (Number(value.schemaVersion) !== 1) {
        return { valid: false, error: `Unsupported preset schema version: ${value.schemaVersion ?? 'missing'}.` };
    }
    if (!value.preset || typeof value.preset !== 'object' || Array.isArray(value.preset)) {
        return { valid: false, error: 'Preset payload is missing.' };
    }
    if (!value.preset.config || typeof value.preset.config !== 'object' || Array.isArray(value.preset.config)) {
        return { valid: false, error: 'Preset configuration is missing.' };
    }
    const name = String(value.preset.name || '').trim();
    if (!name) return { valid: false, error: 'Preset name is missing.' };
    return { valid: true, name: name.slice(0, 80), config: value.preset.config };
}
