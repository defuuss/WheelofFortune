import {
    clampNumber, createPreset, esc, getActiveLevel, getActivePreset, getCooldownMap, getPresets,
    getProgress, getRemovedIds, getState, persist, sourceLabel, updateCharacterHint,
} from './state.js';
import { resolveEntries } from './lorebook.js';
import { uniquePresetName, validatePresetEnvelope } from './core.js';

export const V15_DEFAULTS = Object.freeze({
    hideTriggerTokens: true,
    autoContinueCharacterSpins: true,
    autoContinueDelay: 0.9,
});

const runtime = {
    loopGuardLocked: false,
    lastTrigger: 'None yet',
    lastContinuation: 'Idle',
    lastCleanup: 'None yet',
};

export function ensureV15Settings() {
    const s = getState();
    let changed = false;
    for (const [key, value] of Object.entries(V15_DEFAULTS)) {
        if (s[key] === undefined) {
            s[key] = value;
            changed = true;
        }
    }
    s.hideTriggerTokens = Boolean(s.hideTriggerTokens);
    s.autoContinueCharacterSpins = Boolean(s.autoContinueCharacterSpins);
    s.autoContinueDelay = clampNumber(s.autoContinueDelay, 0, 3, V15_DEFAULTS.autoContinueDelay);
    if (changed) persist();
    return s;
}

export function setRuntimeStatus(patch = {}) {
    Object.assign(runtime, patch || {});
    renderV15Diagnostics(false).catch(() => {});
}

export function setLoopGuardLocked(locked) {
    runtime.loopGuardLocked = Boolean(locked);
    renderV15Diagnostics(false).catch(() => {});
}

export function getRuntimeStatus() {
    return { ...runtime };
}

function safeFilename(value) {
    return String(value || 'wheel-preset')
        .trim()
        .replace(/[^a-z0-9._-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'wheel-preset';
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportActivePreset() {
    // persist() synchronizes the active root mirror back into preset.config first.
    persist();
    const active = getActivePreset();
    if (!active) throw new Error('No active wheel preset.');
    const payload = {
        format: 'sillytavern-wheel-preset',
        schemaVersion: 1,
        extensionVersion: '1.5.0',
        exportedAt: new Date().toISOString(),
        preset: {
            name: active.name,
            config: structuredClone(active.config),
        },
    };
    downloadJson(`${safeFilename(active.name)}.wheel.json`, payload);
    toastr.success(`Exported preset “${active.name}”.`, 'Wheel of Fortune');
}

async function importPresetFile(file) {
    if (!file) return;
    let parsed;
    try {
        parsed = JSON.parse(await file.text());
    } catch {
        throw new Error('The selected file is not valid JSON.');
    }
    const checked = validatePresetEnvelope(parsed);
    if (!checked.valid) throw new Error(checked.error);

    const existingNames = getPresets().map(p => p.name);
    const name = uniquePresetName(checked.name, existingNames);
    const allowedKeys = new Set(Object.keys(getActivePreset()?.config || {}));
    const created = createPreset(name);
    const s = getState();
    for (const [key, value] of Object.entries(checked.config)) {
        if (!allowedKeys.has(key)) continue;
        s[key] = structuredClone(value);
    }
    persist();
    updateCharacterHint();
    toastr.success(`Imported preset “${created.name}”. Reloading the extension UI…`, 'Wheel of Fortune');
    setTimeout(() => location.reload(), 600);
}

function injectV15Ui() {
    if (document.getElementById('wof-v15-ux')) return;
    const root = document.querySelector('#wof-settings .inline-drawer-content');
    if (!root) return;
    root.insertAdjacentHTML('beforeend', `
      <div id="wof-v15-ux">
        <hr>
        <h4>🧠 Character tool-call flow — v1.5</h4>
        <label class="checkbox_label"><input id="wof-hide-trigger-tokens" type="checkbox"><span>Hide wheel trigger tokens from chat after detection</span></label>
        <p class="wof-muted">Recommended. Technical tokens such as <code>[[SPIN_WHEEL preset="Secrets"]]</code> are removed from the stored/rendered message after the extension catches them.</p>
        <label class="checkbox_label"><input id="wof-auto-continue-character" type="checkbox"><span>Automatically generate the character's follow-up after a character-triggered spin</span></label>
        <label for="wof-auto-continue-delay">Delay after result reveal before continuing (seconds)</label>
        <input id="wof-auto-continue-delay" class="text_pole" type="number" min="0" max="3" step="0.1">
        <p class="wof-muted"><b>Hard loop guard:</b> after a character invokes the wheel, another automatic character wheel trigger is blocked until the user sends a new message. This guard is always enabled.</p>

        <hr>
        <h4>📦 Preset import / export</h4>
        <p class="wof-muted">Export the active named wheel as a portable JSON preset. Chat history, cooldown state and one-shot removals are intentionally not exported.</p>
        <div class="wof-row">
          <button id="wof-export-preset" class="menu_button">⬇ Export active preset</button>
          <button id="wof-import-preset" class="menu_button">⬆ Import preset</button>
          <input id="wof-import-preset-file" type="file" accept="application/json,.json" hidden>
        </div>

        <hr>
        <h4>🩺 Diagnostics</h4>
        <div class="wof-row"><button id="wof-refresh-diagnostics" class="menu_button">↻ Refresh diagnostics</button></div>
        <div id="wof-v15-diagnostics" class="wof-help">Loading diagnostics…</div>
      </div>`);
}

function bindV15Setting(id, key, transform = value => value) {
    const el = document.getElementById(id);
    if (!el) return;
    const s = ensureV15Settings();
    if (el.type === 'checkbox') el.checked = Boolean(s[key]);
    else el.value = s[key] ?? '';
    el.addEventListener('change', e => {
        const raw = el.type === 'checkbox' ? e.target.checked : e.target.value;
        s[key] = transform(raw);
        persist();
        renderV15Diagnostics(false).catch(() => {});
    });
}

export async function renderV15Diagnostics(showToast = false) {
    const host = document.getElementById('wof-v15-diagnostics');
    if (!host) return;
    const s = ensureV15Settings();
    const progress = getProgress();
    let eligible = null;
    let sourceError = '';
    try {
        eligible = (await resolveEntries({ level: getActiveLevel() })).length;
    } catch (error) {
        sourceError = String(error?.message || error);
    }
    const cooling = Object.values(getCooldownMap()).filter(until => Number(until) > progress.spins).length;
    const rows = [
        ['Extension', 'v1.5.0'],
        ['Active preset', getActivePreset()?.name || 'None'],
        ['Source', sourceLabel()],
        ['Level / completed spins', `${getActiveLevel()} / ${progress.spins}`],
        ['Eligible entries now', sourceError ? `Error: ${sourceError}` : String(eligible ?? 0)],
        ['Entries cooling down', String(cooling)],
        ['One-shot entries removed', String(getRemovedIds().length)],
        ['Character triggers', s.triggerEnabled ? 'Enabled' : 'Disabled'],
        ['Trigger cleanup', s.hideTriggerTokens ? 'Enabled' : 'Disabled'],
        ['Automatic continuation', s.autoContinueCharacterSpins ? `Enabled (${s.autoContinueDelay.toFixed(1)}s delay)` : 'Disabled'],
        ['Anti-loop guard', runtime.loopGuardLocked ? 'LOCKED until next user message' : 'Ready'],
        ['Last trigger', runtime.lastTrigger],
        ['Last trigger cleanup', runtime.lastCleanup],
        ['Last continuation', runtime.lastContinuation],
    ];
    host.innerHTML = rows.map(([label, value]) => `<div><b>${esc(label)}:</b> ${esc(value)}</div>`).join('');
    if (showToast) toastr.info('Wheel diagnostics refreshed.', 'Wheel of Fortune');
}

export async function initV15SettingsUi() {
    ensureV15Settings();
    injectV15Ui();
    bindV15Setting('wof-hide-trigger-tokens', 'hideTriggerTokens', Boolean);
    bindV15Setting('wof-auto-continue-character', 'autoContinueCharacterSpins', Boolean);
    bindV15Setting('wof-auto-continue-delay', 'autoContinueDelay', value => clampNumber(value, 0, 3, 0.9));

    document.getElementById('wof-export-preset')?.addEventListener('click', () => {
        try { exportActivePreset(); }
        catch (error) { toastr.error(String(error?.message || error), 'Wheel preset export'); }
    });
    const fileInput = document.getElementById('wof-import-preset-file');
    document.getElementById('wof-import-preset')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async e => {
        try { await importPresetFile(e.target.files?.[0]); }
        catch (error) { toastr.error(String(error?.message || error), 'Wheel preset import'); }
        finally { e.target.value = ''; }
    });
    document.getElementById('wof-refresh-diagnostics')?.addEventListener('click', () => renderV15Diagnostics(true));
    await renderV15Diagnostics(false);
}
