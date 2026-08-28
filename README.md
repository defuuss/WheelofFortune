# 🎡 Wheel of Fortune for SillyTavern

A cinematic **Wheel of Fortune / Wheel of Forfeits** extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern).

The wheel can be spun manually, from STscript, or intentionally by the character. It supports weighted outcomes, named presets, Lorebook/Character Book entries, secrecy modes, adaptive intensity, cooldowns, one-shot results, sound effects and automatic character continuation.

## Quick start

### 1. Install

In SillyTavern's extension installer use:

```text
https://github.com/defuuss/WheelofFortune
```

Reload SillyTavern and open **Extensions → Wheel of Fortune**.

### 2. Choose a forfeit source

Use one of:

- **Manual entries**
- **Selected Lorebook / World Info**
- **Active character card Lorebook / Character Book**

For Lorebooks, use **Only entries marked `[WHEEL]`**.

Character-triggered spins can also auto-detect valid `[WHEEL]` entries in the active character's embedded Character Book.

### 3. Test the wheel

```text
/wheel
```

Or let the character deliberately invoke it:

```text
Fine. We'll let the wheel decide.
[[SPIN_WHEEL]]
```

With v1.5's default settings, the technical trigger is removed from the stored/rendered message after detection, the wheel spins once, the result is injected into context, and SillyTavern automatically generates a fresh character message that continues from the real result.

## What v1.5 adds

- 🫥 **Invisible trigger cleanup** — detected wheel tokens are removed from the chat message and later model context.
- 🛑 **Hard anti-loop protection** — an automatically continued character cannot trigger another wheel until the user sends a new message.
- 🔄 **Configurable automatic continuation** — enable/disable it and choose a 0–3 second post-result delay.
- 📦 **Preset import/export** — share named wheels as `.wheel.json` files without exporting chat state.
- 🩺 **Diagnostics panel** — active preset, source, level, eligible entries, cooldowns, one-shot removals, trigger state and continuation status.
- 🧪 **Real unit tests in GitHub Actions** for trigger parsing/cleanup, loop-guard behavior and preset import validation.

### v1.5.1 / v1.5.2 Character Book improvements

- Character cards are fully loaded before their embedded `character_book.entries` are read, fixing lazy/shallow-card loading problems.
- Character-triggered spins automatically prefer matching embedded `[WHEEL]` entries when they exist.
- **v1.5.2 supports self-contained named presets.** If a card explicitly contains `[WHEEL] [preset=Studio] ...` and the character invokes `[[SPIN_WHEEL preset="Studio"]]`, the extension can create `Studio` automatically on first use. The user does not have to manually create that preset first.
- Auto-creation only happens for an explicitly declared `[preset=Name]`; shared entries without a preset tag cannot create arbitrary preset names.

### v1.5.3 floating wheel picker

Clicking the floating **🎡 button on the right side** now opens a wheel selector instead of immediately opening only the currently active preset.

The picker combines:

- named presets already configured in the extension;
- preset names discovered from the active character's embedded `[WHEEL] [preset=Name]` entries.

Character-defined wheels are labelled **Character**. If a wheel exists only in the character card, it is also labelled **New** and is created automatically when you open it. If a configured preset and a Character Book preset use the same name, the picker uses the character's matching forfeits for that opening.

## Core features

- 🎡 Large animated weighted wheel with long suspense spins.
- 🎯 One deliberate spin per wheel opening; no post-result “Spin again”.
- 🎛️ Multiple named wheel presets.
- 🧭 Floating right-side wheel picker for configured + character-defined wheels.
- 🔊 Browser-generated spin sounds and synchronized pointer ticks.
- 🎭 Full, hidden-wheel, hidden-result and Blind visibility modes.
- ⚖️ Weighted forfeits.
- 🔁 Per-entry cooldowns.
- 1️⃣ Per-chat/per-preset one-shot results.
- 📈 Adaptive intensity levels.
- 📚 Lorebook and embedded Character Book support.
- 🆔 Stable `[id=...]` metadata.
- 🧭 `[preset=Name]` Lorebook routing.
- 🛡️ Lorebook validation and level coverage preview.
- 🧯 Cooldown deadlock protection.
- 🎨 Themes, colors, size, direction and probability labels.

## Character-triggered tool flow

A character can use:

```text
[[SPIN_WHEEL]]
[[SPIN_WHEEL preset="Secrets"]]
[[SPIN_WHEEL preset="Studio"]]
[[SPIN_WHEEL preset="Consequences" mode=hidden-result]]
[[SPIN_WHEEL preset="Chaos" mode=blind level=4 seconds=12]]
```

The intended lifecycle is:

```text
character message
      ↓
wheel trigger at end of message
      ↓
trigger removed from chat
      ↓
embedded Character Book checked
      ↓
requested embedded preset auto-created if explicitly declared and missing
      ↓
visual wheel spins once
      ↓
real result injected into model context
      ↓
wheel closes
      ↓
fresh character message generated automatically
```

The character must **not invent the result in the triggering message**. The trigger is a tool-call boundary and should be the last meaningful content in that message.

The anti-loop guard then blocks another automatic character-triggered wheel until the user speaks again.

If automatic generation fails, the selected result remains queued for the next manual generation instead of being lost.

## Floating wheel picker

The floating right-side 🎡 button is intended for interactive selection. It does not immediately spin a wheel.

When clicked, it discovers the current choices and shows them in a compact menu:

```text
🎡 Choose a wheel

Studio        Character · New
Secrets       Character · Preset
Default       Active · Preset
Dares         Preset
```

Selecting a row opens that wheel. You then press the center **SPIN** button once.

For a Character Book wheel that does not yet exist as an extension preset, the picker creates it by cloning the current presentation/audio/timing configuration and sets its source to the active character's Character Book. Its progress, cooldowns and `[once]` removals remain isolated by preset + chat.

## Visibility modes

| Mode | Wheel choices | Selected result |
| --- | --- | --- |
| `full` | visible | visible |
| `hidden-wheel` | hidden | visible |
| `hidden-result` | visible | hidden |
| `blind` | hidden | hidden |

Hidden results can still be sent privately to the character so it can act on them without revealing them to the user.

## Commands

| Command | Purpose |
| --- | --- |
| `/wheel` | Spin the active wheel |
| `/wheel preset="Secrets"` | Spin an existing named preset |
| `/wheel visibility=blind level=4 seconds=12` | One customized spin |
| `/wheel-open` | Open without spinning |
| `/wheel-preset preset="Secrets"` | Select an existing preset |
| `/wheel-presets` | List presets |
| `/wheel-level level=3` | Set current preset/chat level |
| `/wheel-validate` | Validate current Lorebook source |

Manual slash-command spins do **not** auto-create Character Book presets and do **not** automatically generate another character message. Self-contained preset creation is reserved for an intentional character trigger backed by an explicit `[preset=Name]` declaration in that character's embedded book, or for choosing that explicitly declared wheel from the floating picker.

## Lorebook basics

One Lorebook entry = one wheel segment.

Put metadata in **Comment / Title**:

```text
[WHEEL] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret
```

Put only the actual roleplay instruction in **Content**:

```text
Reveal a believable secret that fits established characterization and the current scene. Continue naturally from the result.
```

Route an entry to a named preset:

```text
[WHEEL] [preset=Studio] [id=studio_01] [weight=2] [min=1] [max=5] Studio challenge
```

A card containing the entry above may intentionally call:

```text
[[SPIN_WHEEL preset="Studio"]]
```

or the user can select **Studio** directly from the floating 🎡 picker.

A shared entry simply omits `[preset=...]`.

Persistence:

```text
(no persistence tag)  → stays on the wheel
[cooldown=2]          → leaves for two completed spins, then returns
[once]                → removed for this preset + this chat after winning
```

See the full Lorebook guide for validation rules, IDs, levels and preset routing.

## Named presets and sharing

Each preset can have its own source/manual entries, appearance, visibility, timing, adaptive settings and audio.

Cooldowns, one-shot removals, level and completed-spin count are isolated by **preset + chat**.

For a self-contained character card, explicitly route at least one embedded `[WHEEL]` entry to every preset name that the character may invoke. If that name does not yet exist, the extension can create it from a character trigger or from the floating picker by cloning the current wheel's presentation/timing/audio configuration and using the active Character Book as its source.

v1.5 adds **Export active preset** and **Import preset** in settings. The export contains wheel configuration only; it deliberately excludes chat history, cooldown progress and one-shot state.

## Diagnostics

The diagnostics panel shows:

- extension version;
- active preset and source;
- current level and completed spins;
- currently eligible entry count;
- active cooldown count;
- one-shot removals;
- trigger-cleanup status;
- automatic continuation state;
- anti-loop guard state;
- last trigger/continuation status.

Use this before opening the browser console when troubleshooting.

## Documentation

- **[Lorebook format & validator](docs/LOREBOOK.md)**
- **[AI prompt for integrating the wheel into a character card](docs/CARD_INTEGRATION_PROMPT.md)**
- **[Troubleshooting](docs/TROUBLESHOOTING.md)**

## Development / validation

GitHub Actions checks:

- `manifest.json` validity;
- syntax of all runtime modules;
- manifest target files;
- Node unit tests for critical v1.5 pure helpers.

The active runtime is under `v13/`; the directory name is retained for backward compatibility with the modular v1.3 architecture.

## Current version

**v1.5.3**

## License

Released under the **MIT License**. See [LICENSE](LICENSE).
