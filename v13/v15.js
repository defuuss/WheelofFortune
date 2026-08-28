import {
    TRIGGER_PROMPT_KEY, clampNumber, createPreset, esc, extension_prompt_types, getActiveLevel,
    getActivePreset, getContext, getCooldownMap, getPresets, getProgress, getRemovedIds, getState,
    persist, sourceLabel, updateCharacterHint,
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

export function refreshV15CharacterHint() {
    const s = ensureV15Settings();
    try {
        const c = getContext();
        if (!(s.triggerEnabled && s.characterHint)) {
            c.setExtensionPrompt(TRIGGER_PROMPT_KEY, '', extension_prompt_types.NONE, 0);
            return;
        }
        const names = getPresets().map(p => `"${p.name}"`).join(', ');
        c.setExtensionPrompt(
            TRIGGER_PROMPT_KEY,
            `Wheel of Fortune tool v1.5.4 (active preset "${getActivePreset()?.name || 'Default'}", current level ${getActiveLevel()}): You may deliberately invoke the external visual wheel when it naturally fits the roleplay. Use [[SPIN_WHEEL]] or optional controls such as preset="Name", mode=hidden-wheel, mode=hidden-result, mode=blind, level=N and seconds=N. Configured presets: ${names || 'none'}. A character card may also declare its own named wheels in its embedded Character Book. Preferred v1.5.4 metadata uses SillyTavern Primary Keywords: WheelOfFortune, wof:preset=Name, wof:id=..., wof:weight=..., wof:min=..., wof:max=..., wof:cooldown=..., wof:once. Legacy [WHEEL] [preset=...] metadata remains supported. If you intentionally request a preset explicitly declared by your Character Book, the extension can create it automatically on first use. Do not invent arbitrary preset names. IMPORTANT: a trigger is a tool-call boundary. Put the trigger at the END of your message and stop; never guess, simulate or narrate the result in that same message. The extension selects the real result and, when automatic continuation is enabled, requests a fresh character message that acts on it. Do not emit another wheel trigger in that automatic follow-up; a new user turn is required before another automatic character spin. Hidden results must remain secret. Never narrate wheel metadata, IDs, weights, routing or internal levels.`,
            extension_prompt_types.IN_PROMPT,
            0,
        );
    } catch (error) {
        console.warn('[Wheel of Fortune] v1.5 character hint failed', error);
        updateCharacterHint();
    }
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
    persist();
    const active = getActivePreset();
    if (!active) throw new Error('No active wheel preset.');
    const payload = {
        format: 'sillytavern-wheel-preset',
        schemaVersion: 1,
        extensionVersion: '1.5.4',
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
    refreshV15CharacterHint();
    toastr.success(`Imported preset “${created.name}”. Reloading the extension UI…`, 'Wheel of Fortune');
    setTimeout(() => location.reload(), 600);
}

function injectV15Ui() {
    if (document.getElementById('wof-v15-ux')) return;
    const root = document.querySelector('#wof-settings .inline-drawer-content');
    if (!root) return;

    root.querySelectorAll('p').forEach(p => {
        if (/Official v1\.[34] format/i.test(p.textContent || '')) {
            p.innerHTML = '<b>Official v1.5.4 format:</b> keep the Lorebook Name/Comment readable and put wheel metadata in SillyTavern <b>Primary Keywords</b>: <code>WheelOfFortune</code>, <code>wof:preset=Name</code>, <code>wof:id=...</code>, <code>wof:weight=...</code>, etc. Legacy bracket metadata remains supported.';
        }
    });

    root.insertAdjacentHTML('beforeend', `
      <div id="wof-v15-ux">
        <hr>
        <h4>🧠 Character tool-call flow — v1.5.4</h4>
        <label class="checkbox_label"><input id="wof-hide-trigger-tokens" type="checkbox"><span>Hide wheel trigger tokens from chat after detection</span></label>
        <p class="wof-muted">Recommended. Technical tokens such as <code>[[SPIN_WHEEL preset="Secrets"]]</code> are removed from the stored/rendered message after the extension catches them.</p>
        <label class="checkbox_label"><input id="wof-auto-continue-character" type="checkbox"><span>Automatically generate the character's follow-up after a character-triggered spin</span></label>
        <label for="wof-auto-continue-delay">Delay after result reveal before continuing (seconds)</label>
        <input id="wof-auto-continue-delay" class="text_pole" type="number" min="0" max="3" step="0.1">
        <p class="wof-muted"><b>Hard loop guard:</b> after a character invokes the wheel, another automatic character wheel trigger is blocked until the user sends a new message.</p>
        <p class="wof-muted"><b>Character Book format:</b> use a clean Name such as <code>Surprise Category</code> and Primary Keywords such as <code>WheelOfFortune</code>, <code>wof:preset=Studio</code>, <code>wof:id=studio_01</code>, <code>wof:weight=5</code>.</p>

        <hr>
        <h4>📦 Preset import / export</h4>
        <p class="wof-muted">Export the active named wheel as portable JSON. Chat history, cooldown state and one-shot removals are intentionally not exported.</p>
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
        refreshV15CharacterHint();
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
        ['Extension', 'v1.5.4'],
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

    const root = document.getElementById('wof-settings');
    root?.addEventListener('change', e => {
        if (['wof-trigger-enabled', 'wof-character-hint', 'wof-preset-select'].includes(e.target?.id)) {
            setTimeout(refreshV15CharacterHint, 0);
        }
    });
    root?.addEventListener('click', e => {
        if (['wof-preset-new', 'wof-preset-clone', 'wof-preset-rename', 'wof-preset-delete'].includes(e.target?.id)) {
            setTimeout(refreshV15CharacterHint, 150);
        }
    });

    refreshV15CharacterHint();
    await renderV15Diagnostics(false);
}
