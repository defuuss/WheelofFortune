import {
    createPreset, esc, getActivePreset, getPresets, getState, persist, resolvePreset, selectPreset,
} from './state.js';
import { loadParsedSource } from './lorebook.js';
import { openWheel } from './wheel.js';

let picker = null;
let installed = false;
let rendering = false;

function hasEntryError(entry) {
    return entry?.validationIssues?.some(issue => issue?.severity === 'error');
}

async function discoverCharacterWheels() {
    try {
        const parsed = await loadParsedSource({ sourceOverride: 'character' });
        const names = new Map();
        for (const item of parsed.entries || []) {
            const entry = item?.entry;
            if (!entry?.tagged || hasEntryError(entry)) continue;
            for (const raw of entry.presetNames || []) {
                const name = String(raw || '').trim();
                if (!name || ['*', 'all'].includes(name.toLowerCase())) continue;
                const key = name.toLowerCase();
                if (!names.has(key)) names.set(key, name);
            }
        }
        return [...names.values()].sort((a, b) => a.localeCompare(b));
    } catch (error) {
        console.warn('[Wheel of Fortune] Could not discover Character Book wheel presets', error);
        return [];
    }
}

function ensurePicker() {
    if (picker?.isConnected) return picker;
    picker = document.createElement('div');
    picker.id = 'wof-wheel-picker';
    picker.className = 'wof-wheel-picker';
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', 'Choose Wheel of Fortune preset');
    picker.hidden = true;
    picker.innerHTML = `
      <div class="wof-picker-head">
        <div><b>🎡 Choose a wheel</b><span>Configured presets + active character card</span></div>
        <button class="wof-picker-close" type="button" title="Close">✕</button>
      </div>
      <div class="wof-picker-body"><div class="wof-picker-loading">Loading wheels…</div></div>
    `;
    document.body.appendChild(picker);
    picker.querySelector('.wof-picker-close')?.addEventListener('click', closePicker);
    return picker;
}

function closePicker() {
    if (!picker) return;
    picker.hidden = true;
    picker.classList.remove('wof-picker-open');
}

function mergeWheelRows(characterNames) {
    const configured = getPresets();
    const rows = new Map();
    for (const preset of configured) {
        const key = preset.name.toLowerCase();
        rows.set(key, {
            name: preset.name,
            id: preset.id,
            configured: true,
            character: false,
        });
    }
    for (const name of characterNames) {
        const key = name.toLowerCase();
        const row = rows.get(key) || { name, id: null, configured: false, character: false };
        row.character = true;
        rows.set(key, row);
    }
    const activeId = getActivePreset()?.id;
    return [...rows.values()]
        .map(row => ({ ...row, active: Boolean(row.id && row.id === activeId) }))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

async function openPickerWheel(row) {
    try {
        let preset = row.id ? resolvePreset(row.id) : resolvePreset(row.name);
        if (!preset && row.character) {
            preset = createPreset(row.name, { cloneCurrent: true });
            const state = getState();
            state.source = 'character';
            state.wheelTitle = row.name;
            persist();
            toastr.success(`Created character wheel preset “${row.name}”.`, 'Wheel of Fortune');
        } else if (preset) {
            selectPreset(preset.id);
        }

        if (!preset) {
            toastr.error(`Wheel preset “${row.name}” is unavailable.`, 'Wheel of Fortune');
            return;
        }

        closePicker();
        const opened = await openWheel({
            preset: preset.id,
            sourceOverride: row.character ? 'character' : undefined,
        });
        if (!opened && row.character) {
            toastr.warning(`“${row.name}” was found in the character card, but it has no valid forfeits at the current level.`, 'Wheel of Fortune');
        }
    } catch (error) {
        console.error('[Wheel of Fortune] Could not open selected wheel', error);
        toastr.error(String(error?.message || error), 'Wheel of Fortune');
    }
}

async function renderPicker() {
    if (rendering) return;
    rendering = true;
    const host = ensurePicker().querySelector('.wof-picker-body');
    if (host) host.innerHTML = '<div class="wof-picker-loading">Loading configured and character wheels…</div>';
    try {
        const characterNames = await discoverCharacterWheels();
        const rows = mergeWheelRows(characterNames);
        if (!host) return;
        if (!rows.length) {
            host.innerHTML = '<div class="wof-picker-empty">No wheel presets found.</div>';
            return;
        }
        host.innerHTML = rows.map((row, index) => {
            const badges = [
                row.active ? '<span class="wof-picker-badge wof-picker-active">Active</span>' : '',
                row.character ? '<span class="wof-picker-badge">Character</span>' : '',
                row.configured ? '<span class="wof-picker-badge">Preset</span>' : '<span class="wof-picker-badge wof-picker-new">New</span>',
            ].filter(Boolean).join('');
            const note = row.character && !row.configured
                ? 'Defined by the active Character Book · created on first open'
                : row.character
                    ? 'Configured preset + matching Character Book forfeits'
                    : 'Configured extension preset';
            return `<button class="wof-picker-row${row.active ? ' wof-picker-row-active' : ''}" type="button" data-wheel-index="${index}">
                <span class="wof-picker-main"><b>${esc(row.name)}</b><small>${esc(note)}</small></span>
                <span class="wof-picker-badges">${badges}</span>
                <span class="wof-picker-open-icon">›</span>
              </button>`;
        }).join('');
        host.querySelectorAll('[data-wheel-index]').forEach(button => {
            button.addEventListener('click', () => openPickerWheel(rows[Number(button.dataset.wheelIndex)]));
        });
    } finally {
        rendering = false;
    }
}

async function togglePicker() {
    const root = ensurePicker();
    if (!root.hidden) {
        closePicker();
        return;
    }
    root.hidden = false;
    root.classList.add('wof-picker-open');
    await renderPicker();
}

export function installWheelPicker() {
    if (installed) return;
    installed = true;

    // Capture phase intentionally runs before wheel.js's original floating-button handler.
    // This turns the floating icon into a preset picker without changing manual /wheel behavior.
    document.addEventListener('click', event => {
        const floating = event.target?.closest?.('#wof-floating-button');
        if (floating) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            togglePicker().catch(error => console.error('[Wheel of Fortune] Wheel picker failed', error));
            return;
        }
        if (picker && !picker.hidden && !picker.contains(event.target)) closePicker();
    }, true);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && picker && !picker.hidden) closePicker();
    });

    console.info('[Wheel of Fortune] Floating wheel picker v1.5.3 installed');
}

jQuery(() => installWheelPicker());
