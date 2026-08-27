import {
    clampNumber, clampWeight, defaults, ensureSettings, esc, getProgress, getState, makeId,
    normalizeEntry, normalizeVisibility, persist, renderExtensionTemplateAsync, renderProgressUi,
    resetChatProgress, setCurrentLevel, updateCharacterHint, getContext,
} from './state.js';
import { validateCurrentSource } from './lorebook.js';
import { applyAppearance, drawWheel, openWheel, spinWheel, syncFloatingButton } from './wheel.js';

let previewEntries = [];

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
        if (!confirm('Reset all Wheel of Fortune settings and manual entries?')) return;
        const s = getState();
        Object.keys(s).forEach(k => delete s[k]);
        Object.assign(s, structuredClone(defaults));
        persist();
        location.reload();
    });

    renderManualEntries();
    renderProgressUi();
    await refreshLorebooks();
    syncSourceUi();
    applyAppearance();
    syncFloatingButton();
}
