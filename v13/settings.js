import {
    clampNumber, clampWeight, createPreset, defaults, deletePreset, ensureSettings, esc,
    getActivePreset, getActivePresetName, getPresets, getProgress, getState, makeId,
    normalizeEntry, normalizeVisibility, persist, renamePreset, renderExtensionTemplateAsync,
    renderProgressUi, resetChatProgress, selectPreset, setCurrentLevel, updateCharacterHint, getContext,
} from './state.js';
import { validateCurrentSource } from './lorebook.js';
import { testAudio } from './audio.js';
import { applyAppearance, drawWheel, openWheel, spinWheel, syncFloatingButton } from './wheel.js';

let previewEntries = [];

const SETTING_KEYS = [
    ['wof-trigger-enabled', 'triggerEnabled'], ['wof-trigger-token', 'triggerToken'], ['wof-trigger-user', 'triggerUser'],
    ['wof-character-hint', 'characterHint'], ['wof-visibility-mode', 'visibilityMode'], ['wof-result-mode', 'resultMode'],
    ['wof-secret-to-character', 'secretResultToCharacter'], ['wof-auto-close', 'autoClose'], ['wof-source', 'source'],
    ['wof-lorebook-mode', 'lorebookMode'], ['wof-remove-once', 'removeOnce'], ['wof-spin-seconds', 'spinSeconds'],
    ['wof-reveal-delay', 'revealDelay'], ['wof-adaptive-enabled', 'adaptiveEnabled'], ['wof-default-level', 'defaultLevel'],
    ['wof-max-level', 'maxLevel'], ['wof-auto-level-every', 'autoLevelEvery'], ['wof-wheel-title', 'wheelTitle'],
    ['wof-wheel-theme', 'wheelTheme'], ['wof-wheel-size', 'wheelSize'], ['wof-accent-color', 'accentColor'],
    ['wof-pointer-color', 'pointerColor'], ['wof-text-color', 'textColor'], ['wof-segment-colors', 'segmentColors'],
    ['wof-show-weights', 'showWeights'], ['wof-floating-button-enabled', 'floatingButton'], ['wof-spin-direction', 'spinDirection'],
    ['wof-audio-enabled', 'audioEnabled'], ['wof-audio-volume', 'audioVolume'], ['wof-pointer-ticks', 'pointerTicks'],
    ['wof-tick-volume', 'tickVolume'], ['wof-tick-style', 'tickStyle'], ['wof-spin-sound', 'spinSound'],
    ['wof-result-sound', 'resultSound'],
];

function renderManualEntries() {
    const host = document.getElementById('wof-entry-list');
    if (!host) return;
    const s = getState();
    host.innerHTML = s.entries.map((entry, index) => `
      <div class="wof-entry" data-index="${index}">
        <input class="text_pole wof-entry-title" value="${esc(entry.title)}" title="Forfeit title" placeholder="Forfeit">
        <input class="text_pole wof-entry-weight" type="number" min="0.1" step="0.1" value="${esc(entry.weight)}" title="Weight" placeholder="Weight">
        <input class="text_pole wof-entry-min" type="number" min="1" max="99" value="${esc(entry.minLevel)}" title="Minimum level" placeholder="Min">
        <input class="text_pole wof-entry-max" type="number" min="1" max="99" value="${esc(entry.maxLevel)}" title="Maximum level" placeholder="Max">
        <input class="text_pole wof-entry-cooldown" type="number" min="0" max="99" value="${esc(entry.cooldown)}" title="Cooldown in spins" placeholder="CD">
        <button class="menu_button wof-entry-once" title="Remove permanently after selection">${entry.once ? '1×' : '∞'}</button>
        <button class="menu_button wof-entry-delete" title="Delete">✕</button>
        <textarea class="text_pole wof-entry-description" rows="2" placeholder="Description / instruction">${esc(entry.description)}</textarea>
      </div>`).join('');

    host.querySelectorAll('.wof-entry').forEach(row => {
        const index = Number(row.dataset.index);
        const normalize = () => { s.entries[index] = normalizeEntry(s.entries[index]); persist(); };
        row.querySelector('.wof-entry-title')?.addEventListener('input', e => { s.entries[index].title = e.target.value; persist(); });
        row.querySelector('.wof-entry-weight')?.addEventListener('input', e => { s.entries[index].weight = clampWeight(e.target.value); persist(); });
        row.querySelector('.wof-entry-min')?.addEventListener('input', e => { s.entries[index].minLevel = e.target.value; normalize(); });
        row.querySelector('.wof-entry-max')?.addEventListener('input', e => { s.entries[index].maxLevel = e.target.value; normalize(); });
        row.querySelector('.wof-entry-cooldown')?.addEventListener('input', e => { s.entries[index].cooldown = e.target.value; normalize(); });
        row.querySelector('.wof-entry-description')?.addEventListener('input', e => { s.entries[index].description = e.target.value; persist(); });
        row.querySelector('.wof-entry-once')?.addEventListener('click', () => { s.entries[index].once = !s.entries[index].once; persist(); renderManualEntries(); });
        row.querySelector('.wof-entry-delete')?.addEventListener('click', () => { s.entries.splice(index, 1); persist(); renderManualEntries(); });
    });
}

function addManualEntry() {
    const s = getState();
    s.entries.push(normalizeEntry({ id: makeId(), title: 'New forfeit', description: '', weight: 1, once: false, minLevel: 1, maxLevel: s.maxLevel, cooldown: 0 }));
    persist();
    renderManualEntries();
}

async function refreshLorebooks() {
    const select = document.getElementById('wof-lorebook');
    if (!select) return;
    const names = getContext().getWorldInfoNames?.() ?? [];
    select.innerHTML = '<option value="">— Select a Lorebook —</option>' + names.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
    select.value = names.includes(getState().lorebook) ? getState().lorebook : '';
}

function syncSourceUi() {
    const s = getState();
    document.getElementById('wof-lorebook-options')?.toggleAttribute('hidden', s.source === 'manual');
    document.getElementById('wof-lorebook-select-wrap')?.toggleAttribute('hidden', s.source !== 'lorebook');
    document.getElementById('wof-character-source-note')?.toggleAttribute('hidden', s.source !== 'character');
    document.getElementById('wof-manual-options')?.toggleAttribute('hidden', s.source !== 'manual');
    document.getElementById('wof-custom-colors-wrap')?.toggleAttribute('hidden', s.wheelTheme !== 'custom');
    document.getElementById('wof-adaptive-options')?.toggleAttribute('hidden', !s.adaptiveEnabled);
}

function clearValidationReport() {
    const host = document.getElementById('wof-lorebook-report');
    if (host) { host.hidden = true; host.innerHTML = ''; }
}

function injectV14Settings() {
    if (document.getElementById('wof-v14-presets')) return;
    const root = document.querySelector('#wof-settings .inline-drawer-content');
    if (!root) return;
    const firstHr = root.querySelector('hr');
    const html = `
      <div id="wof-v14-presets">
        <hr>
        <h4>🎛️ Named wheel presets</h4>
        <p class="wof-muted">Each preset stores its own wheel source, manual entries, appearance, secrecy, adaptive levels, timing and audio. Cooldowns and one-shot removals are isolated per preset and per chat.</p>
        <label for="wof-preset-select">Active preset</label>
        <select id="wof-preset-select" class="text_pole"></select>
        <div class="wof-row">
          <button id="wof-preset-new" class="menu_button">＋ New</button>
          <button id="wof-preset-clone" class="menu_button">⧉ Clone</button>
          <button id="wof-preset-rename" class="menu_button">✎ Rename</button>
          <button id="wof-preset-delete" class="menu_button">🗑 Delete</button>
        </div>
        <div class="wof-code-help">
          Character trigger: <code>[[SPIN_WHEEL preset="Secrets" mode=blind]]</code><br>
          Lorebook routing: <code>[WHEEL] [preset=Secrets] [id=secret_01] ...</code><br>
          Lorebook entries without <code>[preset=...]</code> are shared by all presets using that Lorebook.
        </div>

        <hr>
        <h4>🔊 Wheel audio</h4>
        <label class="checkbox_label"><input id="wof-audio-enabled" type="checkbox"><span>Enable wheel sound effects</span></label>
        <label for="wof-audio-volume">Master volume</label>
        <input id="wof-audio-volume" class="text_pole" type="range" min="0" max="1" step="0.05">
        <label class="checkbox_label"><input id="wof-pointer-ticks" type="checkbox"><span>Pointer ticks while wheel crosses segments</span></label>
        <label for="wof-tick-volume">Pointer tick volume</label>
        <input id="wof-tick-volume" class="text_pole" type="range" min="0" max="1" step="0.05">
        <label for="wof-tick-style">Pointer tick style</label>
        <select id="wof-tick-style" class="text_pole"><option value="classic">Classic click</option><option value="soft">Soft</option><option value="wooden">Wooden</option></select>
        <label class="checkbox_label"><input id="wof-spin-sound" type="checkbox"><span>Spin start / wheel hum</span></label>
        <label class="checkbox_label"><input id="wof-result-sound" type="checkbox"><span>Result / reveal sound</span></label>
        <button id="wof-test-audio" class="menu_button">🔊 Test sound</button>
        <p class="wof-muted">Sounds are generated locally with the browser Web Audio API. No external audio files are downloaded.</p>
      </div>`;
    if (firstHr) firstHr.insertAdjacentHTML('beforebegin', html);
    else root.insertAdjacentHTML('beforeend', html);

    // Replace stale v1.3 wording in the rendered settings without requiring a duplicate template.
    root.querySelectorAll('p').forEach(p => {
        if (p.textContent.includes('Official v1.3 format')) {
            p.innerHTML = '<b>Official v1.4 format:</b> metadata belongs in the Lorebook entry Comment/Title (or keys). The Content field contains only the full roleplay instruction. Optional <code>[preset=Name]</code> routes an entry to one or more named wheel presets.';
        }
    });
}

function renderPresetSelect() {
    const select = document.getElementById('wof-preset-select');
    if (!select) return;
    const s = getState();
    select.innerHTML = getPresets().map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    select.value = s.activePresetId;
}

function refreshSettingFields() {
    const s = getState();
    for (const [id, key] of SETTING_KEYS) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.type === 'checkbox') el.checked = Boolean(s[key]);
        else el.value = s[key] ?? '';
    }
    const presetSelect = document.getElementById('wof-preset-select');
    if (presetSelect) presetSelect.value = s.activePresetId;
}

async function refreshAfterPresetChange() {
    renderPresetSelect();
    refreshSettingFields();
    renderManualEntries();
    renderProgressUi();
    await refreshLorebooks();
    syncSourceUi();
    applyAppearance();
    syncFloatingButton();
    clearValidationReport();
}

function bindSetting(id, key, event = 'change', transform = v => v, onChange = null) {
    const el = document.getElementById(id);
    if (!el) return;
    const s = getState();
    if (el.type === 'checkbox') el.checked = Boolean(s[key]);
    else el.value = s[key] ?? '';

    el.addEventListener(event, e => {
        const raw = el.type === 'checkbox' ? e.target.checked : e.target.value;
        s[key] = transform(raw);
        persist();
        if (['triggerEnabled', 'triggerToken', 'characterHint', 'adaptiveEnabled', 'defaultLevel', 'maxLevel'].includes(key)) updateCharacterHint();
        if (['source', 'wheelTheme', 'adaptiveEnabled'].includes(key)) syncSourceUi();
        if (['source', 'lorebookMode', 'defaultLevel', 'maxLevel'].includes(key)) clearValidationReport();
        if (['wheelTitle', 'wheelTheme', 'wheelSize', 'accentColor', 'pointerColor', 'textColor', 'segmentColors', 'showWeights', 'floatingButton'].includes(key)) {
            applyAppearance();
            if (previewEntries.length) drawWheel(previewEntries, false);
        }
        if (['defaultLevel', 'maxLevel'].includes(key)) renderProgressUi();
        onChange?.(s[key]);
    });
}

export async function bindSettingsUi() {
    ensureSettings();
    const settingsHtml = await renderExtensionTemplateAsync('third-party/WheelofFortune', 'settings');
    const container = document.getElementById('extensions_settings');
    if (!container) throw new Error('SillyTavern extension settings container was not found.');
    if (!document.getElementById('wof-settings')) container.insertAdjacentHTML('beforeend', settingsHtml);
    injectV14Settings();

    bindSetting('wof-trigger-enabled', 'triggerEnabled');
    bindSetting('wof-trigger-token', 'triggerToken', 'input', String);
    bindSetting('wof-trigger-user', 'triggerUser');
    bindSetting('wof-character-hint', 'characterHint');
    bindSetting('wof-visibility-mode', 'visibilityMode', 'change', normalizeVisibility);
    bindSetting('wof-result-mode', 'resultMode');
    bindSetting('wof-secret-to-character', 'secretResultToCharacter');
    bindSetting('wof-auto-close', 'autoClose');
    bindSetting('wof-source', 'source');
    bindSetting('wof-lorebook-mode', 'lorebookMode');
    bindSetting('wof-remove-once', 'removeOnce');
    bindSetting('wof-spin-seconds', 'spinSeconds', 'input', v => clampNumber(v, 4, 30, 10.5));
    bindSetting('wof-reveal-delay', 'revealDelay', 'input', v => clampNumber(v, 0, 5, 1.4));
    bindSetting('wof-adaptive-enabled', 'adaptiveEnabled');
    bindSetting('wof-default-level', 'defaultLevel', 'input', v => Math.round(clampNumber(v, 1, 10, 1)));
    bindSetting('wof-max-level', 'maxLevel', 'input', v => Math.round(clampNumber(v, 1, 10, 5)));
    bindSetting('wof-auto-level-every', 'autoLevelEvery', 'input', v => Math.round(clampNumber(v, 0, 50, 3)));
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

    bindSetting('wof-audio-enabled', 'audioEnabled');
    bindSetting('wof-audio-volume', 'audioVolume', 'input', v => clampNumber(v, 0, 1, 0.35));
    bindSetting('wof-pointer-ticks', 'pointerTicks');
    bindSetting('wof-tick-volume', 'tickVolume', 'input', v => clampNumber(v, 0, 1, 0.75));
    bindSetting('wof-tick-style', 'tickStyle');
    bindSetting('wof-spin-sound', 'spinSound');
    bindSetting('wof-result-sound', 'resultSound');

    document.getElementById('wof-preset-select')?.addEventListener('change', async e => {
        if (selectPreset(e.target.value)) await refreshAfterPresetChange();
    });
    document.getElementById('wof-preset-new')?.addEventListener('click', async () => {
        const name = prompt('Name for the new wheel preset:', `Wheel ${getPresets().length + 1}`);
        if (!name?.trim()) return;
        createPreset(name.trim());
        await refreshAfterPresetChange();
    });
    document.getElementById('wof-preset-clone')?.addEventListener('click', async () => {
        const name = prompt('Name for the cloned wheel preset:', `${getActivePresetName()} Copy`);
        if (!name?.trim()) return;
        createPreset(name.trim(), { cloneCurrent: true });
        await refreshAfterPresetChange();
    });
    document.getElementById('wof-preset-rename')?.addEventListener('click', async () => {
        const active = getActivePreset();
        const name = prompt('Rename wheel preset:', active?.name || 'Wheel');
        if (!name?.trim() || !active) return;
        renamePreset(active.id, name.trim());
        await refreshAfterPresetChange();
    });
    document.getElementById('wof-preset-delete')?.addEventListener('click', async () => {
        const active = getActivePreset();
        if (!active) return;
        if (getPresets().length <= 1) { toastr.warning('At least one wheel preset must remain.', 'Wheel of Fortune'); return; }
        if (!confirm(`Delete wheel preset “${active.name}”? Its preset-specific chat state will no longer be used.`)) return;
        deletePreset(active.id);
        await refreshAfterPresetChange();
    });
    document.getElementById('wof-test-audio')?.addEventListener('click', async () => {
        const ok = await testAudio();
        if (!ok) toastr.warning('Browser audio could not be started. Click somewhere on the page and try again.', 'Wheel of Fortune');
    });

    document.getElementById('wof-open')?.addEventListener('click', () => openWheel());
    document.getElementById('wof-spin-settings')?.addEventListener('click', () => spinWheel());
    document.getElementById('wof-add-entry')?.addEventListener('click', addManualEntry);
    document.getElementById('wof-refresh-lorebooks')?.addEventListener('click', refreshLorebooks);
    document.getElementById('wof-validate-lorebook')?.addEventListener('click', () => validateCurrentSource(true));
    document.getElementById('wof-lorebook')?.addEventListener('change', e => {
        getState().lorebook = e.target.value;
        persist();
        clearValidationReport();
    });
    document.getElementById('wof-current-level')?.addEventListener('change', e => setCurrentLevel(e.target.value));
    document.getElementById('wof-level-down')?.addEventListener('click', () => setCurrentLevel(getProgress().level - 1));
    document.getElementById('wof-level-up')?.addEventListener('click', () => setCurrentLevel(getProgress().level + 1));
    document.getElementById('wof-reset-progress')?.addEventListener('click', resetChatProgress);
    document.getElementById('wof-reset')?.addEventListener('click', () => {
        if (!confirm('Reset all Wheel of Fortune settings, presets and entries to defaults?')) return;
        const s = getState();
        Object.keys(s).forEach(k => delete s[k]);
        Object.assign(s, structuredClone(defaults));
        persist();
        location.reload();
    });

    renderPresetSelect();
    refreshSettingFields();
    renderManualEntries();
    renderProgressUi();
    await refreshLorebooks();
    syncSourceUi();
    applyAppearance();
    syncFloatingButton();
}
