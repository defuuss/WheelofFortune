import { SlashCommandParser } from '../../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandNamedArgument } from '../../../../slash-commands/SlashCommandArgument.js';
import {
    ensureSettings, eventSource, event_types, getActivePresetName, getContext,
    getPresets, getProgress, getState, renderProgressUi, selectPreset,
    setCurrentLevel, updateCharacterHint,
} from './state.js';
import { countWheelTriggers, parseControlOptions, shouldBlockCharacterTrigger, stripWheelTriggerTokens } from './core.js';
import { validateCurrentSource } from './lorebook.js';
import { installAudioUnlock } from './audio.js';
import { bindSettingsUi } from './settings.js';
import {
    ensureV15Settings, initV15SettingsUi, setLoopGuardLocked, setRuntimeStatus,
} from './v15.js';
import { buildOverlay, clearInjectedPrompt, closeWheel, isSpinning, openWheel, spinWheel, syncFloatingButton } from './wheel.js';

let commandsRegistered = false;
let lastTriggerFingerprint = '';
let autoContinuationRunning = false;
let autoTriggerLockedUntilUser = false;

function messageFingerprint(message, index) {
    return `${index}:${message?.is_user ? 'u' : 'a'}:${String(message?.mes ?? '')}`;
}

async function cleanTriggerMessage(context, message, index, originalText) {
    const s = getState();
    if (!s.hideTriggerTokens) {
        setRuntimeStatus({ lastCleanup: 'Disabled by setting' });
        return false;
    }
    const cleaned = stripWheelTriggerTokens(originalText, s.triggerToken);
    if (cleaned === originalText) return false;
    message.mes = cleaned;
    try {
        context.updateMessageBlock?.(Number(index), message);
        await context.saveChat?.();
        setRuntimeStatus({ lastCleanup: 'Trigger removed from stored/rendered message' });
        return true;
    } catch (error) {
        console.warn('[Wheel of Fortune] Trigger cleanup could not update the message', error);
        setRuntimeStatus({ lastCleanup: 'Cleanup failed; see browser console' });
        return false;
    }
}

async function continueAfterCharacterSpin() {
    const s = ensureV15Settings();
    if (!s.autoContinueCharacterSpins) {
        setRuntimeStatus({ lastContinuation: 'Automatic continuation disabled; result queued for next generation' });
        return;
    }
    if (autoContinuationRunning) return;
    const c = getContext();
    if (typeof c?.generate !== 'function') {
        console.warn('[Wheel of Fortune] SillyTavern generate() API is unavailable; result remains queued for the next generation.');
        setRuntimeStatus({ lastContinuation: 'generate() unavailable; result queued' });
        toastr.warning('Wheel result is ready, but automatic chat continuation is unavailable. Send/generate once manually.', 'Wheel of Fortune');
        return;
    }

    autoContinuationRunning = true;
    setRuntimeStatus({ lastContinuation: 'Waiting to continue…' });
    try {
        const delayMs = Math.round(Number(s.autoContinueDelay || 0) * 1000);
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
        closeWheel();
        await new Promise(resolve => setTimeout(resolve, 120));
        setRuntimeStatus({ lastContinuation: 'Generating fresh character message…' });
        await c.generate();
        clearInjectedPrompt();
        setRuntimeStatus({ lastContinuation: 'Completed successfully' });
    } catch (error) {
        // Do not clear the prompt on failure: the selected result remains available for the next manual generation.
        console.error('[Wheel of Fortune] Automatic continuation failed', error);
        setRuntimeStatus({ lastContinuation: 'Failed; result remains queued' });
        toastr.warning('Automatic continuation failed. The wheel result is still queued for the next generation.', 'Wheel of Fortune');
    } finally {
        autoContinuationRunning = false;
    }
}

function unlockAutoTriggerForUserTurn() {
    if (!autoTriggerLockedUntilUser) return;
    autoTriggerLockedUntilUser = false;
    setLoopGuardLocked(false);
    setRuntimeStatus({ lastContinuation: 'Loop guard released by new user turn' });
}

async function inspectLatestMessage({ allowUser = false } = {}) {
    const s = ensureV15Settings();
    if (!s.triggerEnabled || isSpinning()) return;
    const c = getContext();
    const index = c.chat.length - 1;
    const message = c.chat[index];
    if (!message || message.is_system) return;
    if (message.is_user && !(s.triggerUser && allowUser)) return;

    const text = String(message.mes ?? '');
    const extended = parseControlOptions(text);
    const custom = s.triggerToken && text.includes(s.triggerToken);
    if (!extended && !custom) return;

    const fingerprint = messageFingerprint(message, index);
    if (fingerprint === lastTriggerFingerprint) return;
    lastTriggerFingerprint = fingerprint;

    const triggeredByCharacter = !message.is_user;
    const triggerCount = countWheelTriggers(text, s.triggerToken);
    await cleanTriggerMessage(c, message, index, text);

    if (triggeredByCharacter && shouldBlockCharacterTrigger({ locked: autoTriggerLockedUntilUser, isUser: false })) {
        console.warn('[Wheel of Fortune] Character trigger ignored by anti-loop guard until the next user message.');
        setRuntimeStatus({ lastTrigger: 'Blocked by anti-loop guard' });
        toastr.info('A second automatic character wheel trigger was blocked until your next message.', 'Wheel of Fortune');
        return;
    }

    if (triggerCount > 1) {
        toastr.warning(`Detected ${triggerCount} wheel triggers in one message. Only the first trigger will be executed.`, 'Wheel of Fortune');
    }

    const options = { ...(extended || {}) };
    if (triggeredByCharacter) options.result = 'prompt';

    setRuntimeStatus({
        lastTrigger: `${triggeredByCharacter ? 'Character' : 'User'} trigger${triggerCount > 1 ? ` (${triggerCount} found; first used)` : ''}`,
        lastContinuation: triggeredByCharacter ? 'Wheel spinning…' : 'Not applicable to user trigger',
    });

    const result = await spinWheel(options);
    if (!result) return;

    if (triggeredByCharacter) {
        // Hard anti-loop rule: an automatically continued character cannot launch another wheel
        // until a real user turn occurs. The blocked token is still cleaned from the message.
        autoTriggerLockedUntilUser = true;
        setLoopGuardLocked(true);
        await continueAfterCharacterSpin();
    }
}

function registerCommands() {
    if (commandsRegistered) return;

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wheel',
        aliases: ['spinwheel', 'wof'],
        callback: async args => spinWheel({
            preset: args.preset,
            visibility: args.visibility || args.mode || (String(args.hidden).toLowerCase() === 'true' ? 'hidden-wheel' : undefined),
            level: args.level,
            seconds: args.seconds,
            result: args.result,
        }),
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'preset', description: 'Named wheel preset to use for this spin', typeList: [ARGUMENT_TYPE.STRING] }),
            SlashCommandNamedArgument.fromProps({ name: 'visibility', description: 'full, hidden-wheel, hidden-result, or blind', typeList: [ARGUMENT_TYPE.STRING] }),
            SlashCommandNamedArgument.fromProps({ name: 'mode', description: 'Alias for visibility', typeList: [ARGUMENT_TYPE.STRING] }),
            SlashCommandNamedArgument.fromProps({ name: 'hidden', description: 'Legacy hide-wheel flag', typeList: [ARGUMENT_TYPE.BOOLEAN] }),
            SlashCommandNamedArgument.fromProps({ name: 'level', description: 'Intensity level for this spin', typeList: [ARGUMENT_TYPE.NUMBER] }),
            SlashCommandNamedArgument.fromProps({ name: 'seconds', description: 'Spin duration for this spin', typeList: [ARGUMENT_TYPE.NUMBER] }),
            SlashCommandNamedArgument.fromProps({ name: 'result', description: 'system, prompt, or private delivery', typeList: [ARGUMENT_TYPE.STRING] }),
        ],
        returns: 'selected forfeit title, or [hidden result]',
        helpString: '<div>Spin the visual wheel. Examples: <code>/wheel preset="Secrets"</code> or <code>/wheel preset="Consequences" visibility=blind level=4 seconds=12</code>.</div>',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wheel-open',
        aliases: ['wof-open'],
        callback: async args => { await openWheel({ preset: args.preset, visibility: args.visibility, level: args.level }); return ''; },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'preset', description: 'Named wheel preset to open', typeList: [ARGUMENT_TYPE.STRING] }),
            SlashCommandNamedArgument.fromProps({ name: 'visibility', description: 'Visibility mode', typeList: [ARGUMENT_TYPE.STRING] }),
            SlashCommandNamedArgument.fromProps({ name: 'level', description: 'Preview intensity level', typeList: [ARGUMENT_TYPE.NUMBER] }),
        ],
        helpString: 'Open a named animated wheel without spinning.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wheel-level',
        callback: async args => {
            if (args.level !== undefined) setCurrentLevel(args.level);
            return String(getProgress().level);
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'level', description: 'Set current chat/preset wheel level', typeList: [ARGUMENT_TYPE.NUMBER] }),
        ],
        helpString: '<div>Get or set the current active preset level. Example: <code>/wheel-level level=3</code>.</div>',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wheel-preset',
        callback: async args => {
            if (args.preset !== undefined && String(args.preset).trim()) {
                const preset = selectPreset(args.preset);
                if (!preset) {
                    toastr.error(`Wheel preset “${args.preset}” does not exist.`, 'Wheel of Fortune');
                    return '';
                }
            }
            return getActivePresetName();
        },
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'preset', description: 'Preset name or ID to activate', typeList: [ARGUMENT_TYPE.STRING] }),
        ],
        helpString: '<div>Get or select the active wheel preset. Example: <code>/wheel-preset preset="Secrets"</code>.</div>',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wheel-presets',
        callback: async () => getPresets().map(p => p.name).join(', '),
        helpString: 'List all configured Wheel of Fortune presets.',
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wheel-validate',
        callback: async () => {
            const report = await validateCurrentSource(true);
            const errors = report.issues.filter(i => i.severity === 'error').length;
            const warnings = report.issues.filter(i => i.severity === 'warning').length;
            return `${errors} errors, ${warnings} warnings`;
        },
        helpString: 'Validate the active preset source and preview level coverage.',
    }));

    commandsRegistered = true;
    console.info('[Wheel of Fortune] Slash commands registered: /wheel, /wheel-open, /wheel-level, /wheel-preset, /wheel-presets, /wheel-validate');
}

try { registerCommands(); }
catch (error) { console.error('[Wheel of Fortune] Early command registration failed', error); }

jQuery(async () => {
    try {
        ensureSettings();
        ensureV15Settings();
        installAudioUnlock();
        buildOverlay();
        syncFloatingButton();
        updateCharacterHint();
        try { registerCommands(); }
        catch (error) { console.warn('[Wheel of Fortune] Deferred command registration failed', error); }

        try { await bindSettingsUi(); }
        catch (error) {
            console.error('[Wheel of Fortune] Settings UI failed', error);
            toastr.warning('Wheel loaded, but its base settings UI failed. Check the browser console.', 'Wheel of Fortune');
        }
        try { await initV15SettingsUi(); }
        catch (error) {
            console.error('[Wheel of Fortune] v1.5 settings UI failed', error);
            toastr.warning('Wheel loaded, but v1.5 diagnostics/import-export controls failed to initialize.', 'Wheel of Fortune');
        }

        eventSource.on(event_types.MESSAGE_RECEIVED, () => inspectLatestMessage({ allowUser: false }));
        if (event_types.MESSAGE_SENT) {
            eventSource.on(event_types.MESSAGE_SENT, () => {
                unlockAutoTriggerForUserTurn();
                inspectLatestMessage({ allowUser: true });
            });
        }
        eventSource.on(event_types.CHAT_CHANGED, () => {
            lastTriggerFingerprint = '';
            autoContinuationRunning = false;
            autoTriggerLockedUntilUser = false;
            setLoopGuardLocked(false);
            clearInjectedPrompt();
            renderProgressUi();
            updateCharacterHint();
            setRuntimeStatus({ lastTrigger: 'None yet in this chat', lastContinuation: 'Idle', lastCleanup: 'None yet' });
        });

        console.info('[Wheel of Fortune] Extension v1.5.0 loaded');
    } catch (error) {
        console.error('[Wheel of Fortune] Fatal initialization error', error);
        toastr.error('Wheel of Fortune failed to initialize.', 'Wheel of Fortune');
    }
});