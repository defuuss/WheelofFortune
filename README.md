# 🎡 Wheel of Fortune for SillyTavern

A cinematic, animated **Wheel of Fortune / Wheel of Forfeits** extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern).

Built for roleplay: spin manually, call it from STscript, let the character intentionally launch it from dialogue, or populate wheels from standalone Lorebooks or a character card's embedded Character Lorebook.

## ✨ Highlights

- 🎡 Large animated weighted wheel with long suspense spins and dramatic result reveal.
- 🎯 **One deliberate spin per wheel opening** — no Spin Again button after a result.
- 🔄 **Automatic character continuation** — a character-triggered wheel acts like a tool call: spin → result injected → fresh character message generated automatically.
- 🎛️ **Multiple named wheel presets** with independent entries/source, appearance, visibility, adaptive levels, timing and audio.
- 🔊 **Pointer ticks and sound effects** generated locally with the Web Audio API — no external MP3 files.
- 🎭 Four visibility modes: Full, Mystery wheel, Secret result and Blind.
- 🤫 Hidden-result modes can privately inform the character/AI without revealing the result to the user.
- ⚖️ Weighted forfeits, cooldowns and one-shot entries.
- 📈 Adaptive intensity levels.
- 📚 Standalone Lorebook / World Info source.
- 🪪 Active character card Lorebook / Character Book source.
- 🆔 Stable Lorebook IDs using `[id=...]`.
- 🧭 **Lorebook preset routing** using `[preset=Name]`.
- 🛡️ Lorebook validator, duplicate-ID detection and level coverage preview.
- 🧯 Cooldown deadlock protection.
- 🤖 Character-triggered spins with preset, visibility, level and duration controls.
- 🎨 Themes, colors, wheel size, pointer, direction and probability labels.
- 📱 Responsive desktop/mobile UI.

## 📦 Installation

Install from SillyTavern's extension installer:

```text
https://github.com/defuuss/WheelofFortune
```

Then reload SillyTavern and open **Extensions → Wheel of Fortune**.

## 🎛️ Named presets — v1.4

Each named preset is a complete wheel configuration. For example:

- General
- Truths
- Dares
- Secrets
- Consequences
- Chaos

A preset stores its own:

- manual entries or Lorebook source;
- appearance/colors/title;
- visibility mode;
- spin and reveal timing;
- adaptive-level settings;
- audio configuration.

Cooldowns, one-shot removals, level and spin count are isolated by **preset + chat**.

Use the preset manager in the extension settings to create, clone, rename, select or delete wheels.

## 🔊 Audio — v1.4

Optional sound features include:

- spin-start sound;
- subtle wheel hum;
- pointer ticks synchronized to the actual wheel rotation;
- naturally slowing tick cadence as the wheel decelerates;
- result/reveal sound;
- subdued secret-result sound;
- master volume and tick volume;
- Classic, Soft and Wooden tick styles;
- Test Sound button.

All audio is generated in-browser with the Web Audio API.

## 🎮 Commands

```text
/wheel
/wheel-open
/wof
/spinwheel
```

Spin a named preset:

```text
/wheel preset="Secrets"
```

Blind named spin:

```text
/wheel preset="Consequences" visibility=blind level=4 seconds=12
```

Select a preset without spinning:

```text
/wheel-preset preset="Secrets"
```

List presets:

```text
/wheel-presets
```

Set the active preset's current chat level:

```text
/wheel-level level=3
```

Validate the active preset source:

```text
/wheel-validate
```

Manual slash-command spins do **not** automatically generate another character message. Automatic continuation is specifically for a wheel intentionally triggered by the character.

## 🤖 Character-triggered wheel

The active character can deliberately output:

```text
[[SPIN_WHEEL]]
[[SPIN_WHEEL preset="Secrets"]]
[[SPIN_WHEEL preset="Secrets" mode=hidden-wheel]]
[[SPIN_WHEEL preset="Consequences" mode=hidden-result]]
[[SPIN_WHEEL preset="Chaos" mode=blind level=4 seconds=12]]
```

### Automatic tool-like continuation — v1.4.1

A character-triggered spin now follows this sequence automatically:

1. the character finishes a message containing the trigger;
2. the extension catches the trigger;
3. the visual wheel opens and spins once;
4. the actual selected forfeit is injected into model context;
5. the wheel closes after the result has been shown briefly;
6. SillyTavern starts a **new normal character generation**;
7. that fresh character message continues the RP using the selected result;
8. the temporary result prompt is cleared after the generation completes.

This also works with secret-result and Blind modes: the user does not need to see the result for the model to act on it.

The character should therefore put the trigger at the **end of its message** and must not guess the result itself:

```text
Fine. We'll let the wheel decide.
[[SPIN_WHEEL preset="Secrets"]]
```

The next character message is generated only after the real wheel result exists.

If automatic generation fails because SillyTavern is not ready or the backend is unavailable, the selected result remains queued for the next manual generation instead of being lost.

When the character hint is enabled, the extension tells the model the actual configured preset names and instructs it not to invent or casually quote control tokens.

See **[docs/CARD_INTEGRATION_PROMPT.md](docs/CARD_INTEGRATION_PROMPT.md)** for a ready-made prompt that teaches another AI how to integrate the wheel into a character card and build its Character Lorebook correctly.

## 📚 Lorebook format

One Lorebook entry equals one wheel segment.

Put metadata in **Comment / Title**:

```text
[WHEEL] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret
```

Put only the roleplay instruction in **Content**.

Route an entry to one preset:

```text
[WHEEL] [preset=Secrets] [id=secret_01] [weight=3] Reveal a secret
```

Route one entry to multiple presets:

```text
[WHEEL] [preset=Secrets,Truths] [id=confession_01] [weight=2] Confession
```

Leave out `[preset=...]` to make the entry shared by all presets using the same Lorebook.

Supported metadata:

- `[WHEEL]`
- `[id=unique_stable_id]`
- `[preset=Name]`
- `[weight=3]`
- `[min=2]`
- `[max=4]`
- `[level=3]`
- `[cooldown=2]`
- `[once]`

### Persistence

No persistence tag → stays on the wheel.

`[cooldown=2]` → leaves for two completed spins of that preset, then returns.

`[once]` → permanently disappears for that preset in the current chat after winning.

## 🪪 Active character Lorebook

Set Source to:

```text
Active character card Lorebook
```

The extension reads the active character's embedded `character_book.entries` directly, so a character card can carry its own wheel pack.

Use tagged-only mode so normal character lore remains untouched and only entries containing `[WHEEL]` become wheel segments.

## 🛡️ Validator

Click **Validate / preview Lorebook** or run:

```text
/wheel-validate
```

The validator checks malformed metadata, duplicate IDs, unknown preset names, invalid weights/levels, contradictory persistence tags, empty level coverage and missing repeatable baselines. Entries with validation errors are excluded from the wheel.

## 🎭 Visibility modes

- **Full** — choices and result visible.
- **Mystery wheel / hidden-wheel** — choices hidden, result visible.
- **Secret result / hidden-result** — choices visible, result hidden; pointer hidden too.
- **Blind** — choices and result hidden.

## 📈 Adaptive levels

A typical five-level pack might use:

| Level | Example role |
| ---: | --- |
| 1 | introductory / light |
| 2 | more personal / consequential |
| 3 | stronger scene changes |
| 4 | rare / dramatic |
| 5 | exceptional / one-shot |

These meanings are design suggestions, not hard-coded rules.

## 📖 Documentation

- **[Lorebook format & validator guide](docs/LOREBOOK.md)**
- **[AI character-card + Character Lorebook integration prompt](docs/CARD_INTEGRATION_PROMPT.md)**

## 🧩 Runtime

The active runtime is modular under `v13/` for compatibility with the v1.3 architecture:

```text
v13/state.js       settings, presets and per-chat/per-preset state
v13/lorebook.js    parsing, validation, preset routing and eligibility
v13/wheel.js       visual wheel, one-spin lifecycle, result delivery and audio hooks
v13/audio.js       Web Audio sound engine and pointer tick tracking
v13/settings.js    settings, preset manager and validator UI
v13/index.js       commands, character triggers and automatic continuation
```

## 🧪 Current version

**v1.4.1**

v1.4.1 removes the post-result Spin Again flow and turns character-triggered spins into an automatic tool-style sequence: select result, inject it into context, close the wheel, and generate a fresh character message. v1.4 introduced named wheel presets, per-preset chat state, character-selectable presets, Lorebook `[preset=...]` routing, synchronized pointer ticks and configurable Web Audio sound effects.

## License

Released under the **MIT License**. See [LICENSE](LICENSE).
