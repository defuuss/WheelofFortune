import {
    clampNumber, clampWeight, esc, getActiveLevel, getActivePresetName, getCooldownMap,
    getPresets, getProgress, getRemovedIds, getState, isRemoved, normalizeEntry, getContext,
} from './state.js';
import { parseWheelKeywordMetadata } from './core.js';

const STABLE_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const META_TAG_RE = /\[(wheel|once|id|weight|level|min|max|minlevel|maxlevel|cooldown|preset)(?:\s*=\s*([^\]]+))?\]/gi;

function entryKeys(entry) {
    if (Array.isArray(entry?.key)) return entry.key;
    if (Array.isArray(entry?.keys)) return entry.keys;
    if (entry?.key) return [entry.key];
    return [];
}

function rawEntryEnabled(entry) {
    if (!entry) return false;
    if (entry.disable === true) return false;
    if (entry.enabled === false) return false;
    return true;
}

function addMetaTag(tags, name, value) {
    const key = String(name).toLowerCase();
    if (!tags[key]) tags[key] = [];
    const normalized = value === true ? true : String(value).trim();
    if (!tags[key].some(existing => String(existing).toLowerCase() === String(normalized).toLowerCase())) {
        tags[key].push(normalized);
    }
}

function parseRawMeta(entry) {
    const keys = entryKeys(entry);
    const name = String(entry?.name ?? '');
    const comment = String(entry?.comment ?? '');
    const metadataFields = [...new Set([comment, name, ...keys].map(value => String(value ?? '').trim()).filter(Boolean))];
    const haystack = metadataFields.join(' ');
    const tags = {};

    // Legacy / portable bracket syntax can live in Comment, Name, or keys.
    for (const field of metadataFields) {
        for (const m of field.matchAll(META_TAG_RE)) {
            addMetaTag(tags, m[1], m[2] === undefined ? true : String(m[2]).trim());
        }
    }

    // v1.5.4 native SillyTavern syntax uses Primary Keywords so the visible entry
    // Name/Comment can stay clean. Example: WheelOfFortune, wof:preset=Studio,
    // wof:id=studio_01, wof:weight=5, wof:min=1, wof:max=5.
    const keywordTags = parseWheelKeywordMetadata(keys);
    for (const [key, values] of Object.entries(keywordTags)) {
        for (const value of values) addMetaTag(tags, key, value);
    }

    return {
        haystack,
        name,
        comment,
        keys,
        tags,
        first: tagName => tags[tagName]?.[0],
        has: tagName => Boolean(tags[tagName]?.length),
    };
}

function parseStrictNumber(raw, { integer = false, min = -Infinity, max = Infinity } = {}) {
    if (raw === undefined || raw === null || raw === true || raw === '') return { present: false, value: undefined, valid: true };
    const text = String(raw).trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) return { present: true, value: undefined, valid: false };
    const n = Number(text);
    if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) return { present: true, value: n, valid: false };
    return { present: true, value: n, valid: true };
}

function cleanMetaString(raw) {
    return String(raw ?? '').trim().replace(/^(?:"|')|(?:"|')$/g, '').trim();
}

function parsePresetNames(values = []) {
    return [...new Set(values
        .filter(v => v !== true && v !== undefined && v !== null)
        .flatMap(v => cleanMetaString(v).split(','))
        .map(cleanMetaString)
        .filter(Boolean))];
}

function stripMetaTitle(text) {
    return String(text || '').replace(META_TAG_RE, '').replace(/\s{2,}/g, ' ').trim();
}

function normalizeRawEntry(raw, sourceName) {
    const meta = parseRawMeta(raw);
    const issues = [];
    const add = (severity, message) => issues.push({ severity, message });
    const tagged = meta.has('wheel');
    const idRaw = meta.first('id');
    const stableId = idRaw && idRaw !== true ? String(idRaw).trim() : '';
    const presetNames = parsePresetNames(meta.tags.preset || []);

    if (idRaw === true || (stableId && !STABLE_ID_RE.test(stableId))) {
        add('error', 'Wheel id must be 1–64 characters using letters, numbers, _, ., :, or -.');
    }
    if (meta.tags.wheel?.some(v => v !== true)) add('warning', 'Wheel marker is a flag and should not have a value.');
    if (meta.tags.once?.some(v => v !== true)) add('warning', 'One-shot marker is a flag and should not have a value.');
    if (meta.tags.preset?.some(v => v === true || !cleanMetaString(v))) add('error', 'Preset metadata requires a preset name.');
    for (const name of ['id', 'weight', 'level', 'min', 'max', 'minlevel', 'maxlevel', 'cooldown']) {
        if ((meta.tags[name]?.length || 0) > 1) add('error', `Wheel metadata “${name}” is defined more than once.`);
    }
    if (meta.has('min') && meta.has('minlevel')) add('error', 'Use only one of min or minlevel.');
    if (meta.has('max') && meta.has('maxlevel')) add('error', 'Use only one of max or maxlevel.');

    const weightN = parseStrictNumber(meta.first('weight'), { min: 0.000001, max: 1000 });
    const levelN = parseStrictNumber(meta.first('level'), { integer: true, min: 1, max: 99 });
    const minN = parseStrictNumber(meta.first('min') ?? meta.first('minlevel'), { integer: true, min: 1, max: 99 });
    const maxN = parseStrictNumber(meta.first('max') ?? meta.first('maxlevel'), { integer: true, min: 1, max: 99 });
    const cooldownN = parseStrictNumber(meta.first('cooldown'), { integer: true, min: 0, max: 99 });

    if (!weightN.valid) add('error', 'weight must be a positive number up to 1000.');
    if (!levelN.valid) add('error', 'level must be an integer from 1 to 99.');
    if (!minN.valid) add('error', 'min must be an integer from 1 to 99.');
    if (!maxN.valid) add('error', 'max must be an integer from 1 to 99.');
    if (!cooldownN.valid) add('error', 'cooldown must be an integer from 0 to 99.');
    if (levelN.present && (minN.present || maxN.present)) add('warning', 'Use either exact level or min/max, not both. Exact level takes precedence.');
    if (meta.has('once') && cooldownN.present && cooldownN.value > 0) add('warning', 'One-shot makes cooldown irrelevant; cooldown will be ignored.');

    const minLevel = levelN.valid && levelN.present ? levelN.value : (minN.valid && minN.present ? minN.value : 1);
    const maxLevel = levelN.valid && levelN.present ? levelN.value : (maxN.valid && maxN.present ? maxN.value : 99);
    if (minLevel > maxLevel) add('error', `min=${minLevel} cannot be higher than max=${maxLevel}.`);

    // Prefer the SillyTavern Name field, then Comment. Legacy bracket metadata is
    // stripped, while v1.5.4 Primary Keyword metadata never pollutes the title.
    const nameTitle = stripMetaTitle(meta.name);
    const commentTitle = stripMetaTitle(meta.comment);
    const title = nameTitle || commentTitle || `Lorebook entry ${raw?.uid ?? raw?.id ?? ''}` || 'Untitled forfeit';
    if (!nameTitle && !commentTitle) add('warning', 'Entry has no clear visible Name/Comment title.');
    const description = String(raw?.content ?? '').trim();
    if (!description) add('warning', 'Entry has no Content/instruction.');

    const nativeId = raw?.uid ?? raw?.id;
    const identity = stableId || (nativeId !== undefined && nativeId !== null ? `native-${nativeId}` : `title-${title}`);
    const sourceId = `${sourceName}:${identity}`;

    return {
        entry: normalizeEntry({
            id: sourceId,
            sourceId,
            stableId: stableId || null,
            nativeId,
            title,
            description,
            weight: weightN.valid && weightN.present ? weightN.value : 1,
            once: meta.has('once'),
            minLevel,
            maxLevel,
            cooldown: meta.has('once') ? 0 : (cooldownN.valid && cooldownN.present ? cooldownN.value : 0),
            tagged,
            presetNames,
            rawHaystack: meta.haystack,
            validationIssues: issues,
        }),
        issues,
        tagged,
    };
}

function validateParsedEntries(parsed, { requireTagged = true } = {}) {
    const issues = [];
    const relevant = parsed.filter(x => !requireTagged || x.entry.tagged);
    const explicit = new Map();
    const identities = new Map();
    const knownPresets = getPresets();
    const knownNames = new Set(knownPresets.flatMap(p => [p.name.toLowerCase(), p.id.toLowerCase()]));

    for (const item of relevant) {
        for (const issue of item.issues) issues.push({ ...issue, title: item.entry.title, id: item.entry.stableId || item.entry.sourceId });
        for (const presetName of item.entry.presetNames || []) {
            const p = presetName.toLowerCase();
            if (p !== '*' && p !== 'all' && !knownNames.has(p)) {
                issues.push({ severity: 'warning', title: item.entry.title, id: item.entry.stableId || item.entry.sourceId, message: `Unknown wheel preset “${presetName}”. This entry will stay inactive until that preset exists or is auto-created from the character card.` });
            }
        }
        const identityKey = String(item.entry.sourceId || '').toLowerCase();
        if (!identities.has(identityKey)) identities.set(identityKey, []);
        identities.get(identityKey).push(item);
        if (item.entry.stableId) {
            const key = item.entry.stableId.toLowerCase();
            if (!explicit.has(key)) explicit.set(key, []);
            explicit.get(key).push(item);
        }
    }

    for (const [identity, items] of identities) {
        if (items.length > 1) {
            for (const item of items) {
                issues.push({ severity: 'error', title: item.entry.title, id: identity, message: 'Two wheel entries resolve to the same identity. Give every entry a unique wheel id.' });
                item.entry.validationIssues.push({ severity: 'error', message: 'Duplicate wheel identity.' });
            }
        }
    }

    for (const [id, items] of explicit) {
        if (items.length > 1) {
            for (const item of items) issues.push({ severity: 'error', title: item.entry.title, id, message: `Duplicate stable wheel id: ${id}` });
        }
    }
    return { relevant, issues };
}

async function getCharacterBookSource() {
    const initial = getContext();
    const characterId = initial?.characterId;
    if (characterId === undefined || characterId === null) {
        return {
            sourceName: 'character:none',
            displayName: 'No active character Lorebook',
            rawEntries: [],
        };
    }

    try {
        await initial.unshallowCharacter?.(characterId);
    } catch (error) {
        console.warn('[Wheel of Fortune] Could not unshallow active character before reading Character Book', error);
    }

    const c = getContext();
    const char = c?.characters?.[characterId] ?? initial?.characters?.[characterId];
    const book = char?.data?.character_book ?? char?.character_book;
    const entries = Array.isArray(book?.entries) ? book.entries : [];
    return {
        sourceName: `character:${characterId}`,
        displayName: `${char?.name || c?.name2 || 'Active character'} Lorebook`,
        rawEntries: entries,
    };
}

export async function getRawSourceEntries(sourceOverride = null) {
    const s = getState();
    const source = sourceOverride || s.source;
    const c = getContext();

    if (source === 'character') return getCharacterBookSource();

    if (source === 'lorebook') {
        if (!s.lorebook) return { sourceName: 'lorebook:none', displayName: 'No Lorebook selected', rawEntries: [] };
        const book = await c.loadWorldInfo(s.lorebook);
        return { sourceName: `lorebook:${s.lorebook}`, displayName: s.lorebook, rawEntries: Object.values(book?.entries ?? {}) };
    }

    return { sourceName: 'manual', displayName: 'Manual entries', rawEntries: [] };
}

function matchesPresetRef(entry, presetRef = null) {
    const names = Array.isArray(entry?.presetNames) ? entry.presetNames : [];
    if (!names.length) return true;
    const activeName = getActivePresetName().toLowerCase();
    const activeId = String(getState().activePresetId || '').toLowerCase();
    const requested = String(presetRef || '').trim().toLowerCase();
    return names.some(name => {
        const value = String(name).trim().toLowerCase();
        return value === '*' || value === 'all' || value === requested || value === activeName || value === activeId;
    });
}

function matchesActivePreset(entry) {
    return matchesPresetRef(entry, null);
}

export async function loadParsedSource({ validateAll = false, sourceOverride = null } = {}) {
    const s = getState();
    const source = sourceOverride || s.source;
    if (source === 'manual') {
        const entries = s.entries.filter(e => e?.title).map(e => ({ entry: { ...normalizeEntry(e), sourceId: e.id, presetNames: [] }, issues: [], tagged: true }));
        return { displayName: 'Manual entries', entries, issues: [] };
    }

    try {
        const raw = await getRawSourceEntries(sourceOverride);
        const parsed = raw.rawEntries.filter(rawEntryEnabled).map(e => normalizeRawEntry(e, raw.sourceName));
        const requireTagged = s.lorebookMode !== 'all';
        const { relevant, issues } = validateParsedEntries(parsed, { requireTagged });

        if (validateAll && requireTagged) {
            for (const item of parsed.filter(x => !x.entry.tagged && /(?:\[(?:weight|level|min|max|cooldown|once|id|preset)\b|\bwof:(?:weight|level|min|max|cooldown|once|id|preset)\b)/i.test(x.entry.rawHaystack || ''))) {
                issues.push({ severity: 'warning', title: item.entry.title, id: item.entry.sourceId, message: 'Wheel metadata was found but no WheelOfFortune / [WHEEL] marker exists, so tagged-only mode ignores this entry.' });
            }
        }
        return { displayName: raw.displayName, entries: relevant, issues };
    } catch (error) {
        console.error('[Wheel of Fortune] Failed to load source', error);
        return { displayName: 'Lorebook', entries: [], issues: [{ severity: 'error', title: 'Lorebook', message: String(error?.message || error) }] };
    }
}

function hasValidationError(entry) { return entry.validationIssues?.some(i => i.severity === 'error'); }
function inLevel(entry, level) { return level >= Number(entry.minLevel || 1) && level <= Number(entry.maxLevel || 99); }
function cooldownUntil(entry) { return Number(getCooldownMap()[entry.sourceId] || 0); }

export async function hasCharacterWheelEntries({ preset = null } = {}) {
    const parsed = await loadParsedSource({ sourceOverride: 'character' });
    return parsed.entries
        .map(x => x.entry)
        .some(e => e.tagged && !hasValidationError(e) && matchesPresetRef(e, preset));
}

export async function resolveEntries(options = {}) {
    const level = getActiveLevel(options.level);
    const parsed = await loadParsedSource({ sourceOverride: options.sourceOverride || null });
    const base = parsed.entries
        .map(x => x.entry)
        .filter(e => matchesActivePreset(e) && !hasValidationError(e) && !isRemoved(e.sourceId) && inLevel(e, level));

    if (!base.length) return [];
    const spins = getProgress().spins;
    const active = base.filter(e => cooldownUntil(e) <= spins);
    if (active.length) return active;

    const soonest = Math.min(...base.map(cooldownUntil));
    const fallback = base.filter(e => cooldownUntil(e) === soonest).map(e => ({ ...e, cooldownSafetyRelease: true }));
    console.warn('[Wheel of Fortune] Cooldown deadlock prevented; temporarily releasing', fallback.map(e => e.title));
    return fallback;
}

export async function validateCurrentSource(showToast = true) {
    const s = getState();
    const parsed = await loadParsedSource({ validateAll: true });
    const entries = parsed.entries.map(x => x.entry).filter(matchesActivePreset);
    const issues = [...parsed.issues];
    const presetName = getActivePresetName();

    if (s.source !== 'manual' && s.lorebookMode === 'all') {
        issues.push({ severity: 'warning', title: parsed.displayName, message: 'Import mode is “All enabled entries”. Tagged-only mode is safer because unrelated Lorebook entries cannot become wheel segments.' });
    }
    if (entries.length && !entries.some(e => e.stableId)) {
        issues.push({ severity: 'warning', title: parsed.displayName, message: 'No active entry uses an explicit stable wheel id. Use wof:id=... (recommended) or legacy [id=...].' });
    }
    if (!entries.length && s.source !== 'manual') {
        issues.push({ severity: 'error', title: presetName, message: `No Lorebook entries are shared or routed to preset “${presetName}”.` });
    }

    const levelRows = [];
    for (let level = 1; level <= s.maxLevel; level++) {
        const configured = entries.filter(e => !hasValidationError(e) && inLevel(e, level));
        const repeatable = configured.filter(e => !e.once && !e.cooldown).length;
        const cooldown = configured.filter(e => !e.once && e.cooldown > 0).length;
        const once = configured.filter(e => e.once).length;
        levelRows.push({ level, total: configured.length, repeatable, cooldown, once });
        if (!configured.length) issues.push({ severity: 'error', title: `${presetName} · Level ${level}`, message: 'No valid forfeits are configured for this level.' });
        else if (!repeatable) issues.push({ severity: 'warning', title: `${presetName} · Level ${level}`, message: 'No always-repeatable baseline entry. Cooldown safety prevents a lock, but 2–3 repeatable entries are recommended.' });
    }

    const report = { displayName: `${parsed.displayName} · preset ${presetName}`, issues, levelRows, count: entries.length };
    renderValidationReport(report);

    if (showToast) {
        const errors = issues.filter(i => i.severity === 'error').length;
        const warnings = issues.filter(i => i.severity === 'warning').length;
        if (errors) toastr.error(`${errors} error(s), ${warnings} warning(s). See the Wheel validator.`, 'Wheel Lorebook');
        else if (warnings) toastr.warning(`No errors; ${warnings} warning(s). See the Wheel validator.`, 'Wheel Lorebook');
        else toastr.success(`${entries.length} wheel entries validated successfully for “${presetName}”.`, 'Wheel Lorebook');
    }
    return report;
}

export function renderValidationReport(report) {
    const host = document.getElementById('wof-lorebook-report');
    if (!host) return;
    const errors = report.issues.filter(i => i.severity === 'error').length;
    const warnings = report.issues.filter(i => i.severity === 'warning').length;
    const issueHtml = report.issues.length
        ? report.issues.map(i => `<div class="wof-validation-item wof-validation-${esc(i.severity)}"><b>${i.severity === 'error' ? '⛔' : '⚠️'} ${esc(i.title || 'Entry')}</b><span>${esc(i.message)}</span></div>`).join('')
        : '<div class="wof-validation-ok">✅ No validation problems found.</div>';
    const rows = report.levelRows.map(r => `<tr><td>${r.level}</td><td>${r.total}</td><td>${r.repeatable}</td><td>${r.cooldown}</td><td>${r.once}</td></tr>`).join('');
    host.innerHTML = `<div class="wof-validation-summary"><b>${esc(report.displayName)}</b> · ${report.count} entries · ${errors} errors · ${warnings} warnings</div><table class="wof-level-table"><thead><tr><th>Level</th><th>Total</th><th>Repeat</th><th>Cooldown</th><th>Once</th></tr></thead><tbody>${rows}</tbody></table>${issueHtml}`;
    host.hidden = false;
}

export function getCurrentRemovedSummary() {
    return { removed: getRemovedIds().length, spins: getProgress().spins };
}
