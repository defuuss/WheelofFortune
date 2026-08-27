# 🎡 Wheel of Fortune for SillyTavern

A cinematic, animated **Wheel of Fortune / Wheel of Forfeits** extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern).

Built for roleplay: spin manually, call it from STscript, let the character intentionally launch it from dialogue, or populate the wheel from a standalone Lorebook **or directly from the active character card's embedded Character Lorebook**.

## ✨ Highlights

- 🎡 Large animated on-screen weighted wheel.
- ⏳ Long suspense spins with **11–16 rotations** plus a configurable post-stop reveal pause.
- 💥 Large dramatic result reveal.
- 🎭 Four visibility modes: **Full**, **Mystery wheel**, **Secret result**, and **Blind**.
- 🤫 Hidden-result modes mask the result from the UI, history, pointer, toast and visible system output while optionally telling the character/AI privately.
- ⚖️ Weighted forfeits.
- 🔁 Per-entry cooldowns.
- 1️⃣ Per-chat one-shot forfeits.
- 📈 Adaptive intensity levels stored independently per chat.
- 📚 Standalone Lorebook / World Info source.
- 🪪 **Active character card Lorebook / Character Book source** — wheel packs can travel with character cards.
- 🆔 Stable Lorebook IDs using `[id=...]`.
- 🛡️ Built-in Lorebook validator and level preview.
- 🔒 Invalid wheel entries are excluded instead of silently repaired.
- 🧯 Cooldown deadlock protection.
- 🤖 Character-triggered spins with visibility, level and duration options.
- 🎨 Themes, custom colors, wheel size, pointer, direction, probability labels and floating launcher.
- 📱 Responsive desktop/mobile UI.
- 💾 No external server or third-party JavaScript library required.

## 📦 Installation

In SillyTavern install the extension from:

```text
https://github.com/defuuss/WheelofFortune
```

Then reload SillyTavern and open **Extensions → Wheel of Fortune**.

## 🎮 Commands

```text
/wheel
/wheel-open
/wof
/spinwheel
```

Mystery wheel:

```text
/wheel visibility=hidden-wheel
```

Secret result:

```text
/wheel visibility=hidden-result
```

Completely blind:

```text
/wheel visibility=blind
```

One stronger, longer blind spin:

```text
/wheel visibility=blind level=4 seconds=12
```

Set the persistent level for the current chat:

```text
/wheel-level level=3
```

Validate the current wheel source:

```text
/wheel-validate
```

## 🤖 Character-triggered wheel

The active character can deliberately output:

```text
[[SPIN_WHEEL]]
[[SPIN_WHEEL mode=hidden-wheel]]
[[SPIN_WHEEL mode=hidden-result]]
[[SPIN_WHEEL mode=blind]]
[[SPIN_WHEEL level=3]]
[[SPIN_WHEEL mode=blind level=4 seconds=12]]
```

The extension can inject a compact instruction explaining these controls to the character. Trigger tokens are treated as control commands rather than ordinary dialogue.

For an AI that is creating/editing a SillyTavern card, use **[docs/CARD_INTEGRATION_PROMPT.md](docs/CARD_INTEGRATION_PROMPT.md)**. It now teaches the AI both the trigger behavior **and how to build the character's embedded Wheel Lorebook correctly**.

## 📚 Official v1.3 Lorebook format

One Lorebook entry equals one wheel segment.

Put metadata in **Comment / Title**:

```text
[WHEEL] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret
```

Put only the detailed roleplay instruction in **Content**.

Exact-level one-shot example:

```text
[WHEEL] [id=plot_01] [weight=1] [level=5] [once] Major turning point
```

Supported metadata:

- `[WHEEL]`
- `[id=unique_stable_id]`
- `[weight=3]`
- `[min=2]`
- `[max=4]`
- `[level=3]`
- `[cooldown=2]`
- `[once]`

### Persistence

```text
(no persistence tag)
```

→ stays on the wheel.

```text
[cooldown=2]
```

→ leaves for two completed spins and then returns.

```text
[once]
```

→ permanently disappears for the **current chat** after winning.

One-shot state, cooldowns, spin count and adaptive level are all isolated per SillyTavern chat.

## 🪪 Active character Lorebook

v1.3 adds a source option:

```text
Active character card Lorebook
```

The extension reads the active character's embedded `character_book.entries` directly. This allows a character card to contain its own wheel pack.

Use **tagged-only mode** so ordinary character lore remains untouched and only entries containing `[WHEEL]` become wheel segments.

## 🛡️ Lorebook validator

Click **Validate / preview Lorebook** or run:

```text
/wheel-validate
```

The validator checks for:

- duplicate or malformed stable IDs;
- invalid weights;
- invalid level ranges;
- `min > max`;
- `[level]` mixed with `[min]/[max]`;
- `[once]` mixed with cooldown;
- duplicate metadata fields;
- missing title or Content;
- missing `[WHEEL]` markers when wheel metadata is detected;
- levels with no valid entries;
- levels with no repeatable baseline entries.

It also previews each level and shows counts for **total**, **repeatable**, **cooldown**, and **one-shot** entries.

Entries with validation errors do not enter the active wheel.

## 🧯 Cooldown deadlock protection

If every otherwise-valid entry at the active level is currently cooling down, v1.3 temporarily releases the entry or entries whose cooldown expires first. This prevents a wheel from reaching zero selectable segments and becoming permanently stuck.

A well-designed pack should still contain at least **2–3 always-repeatable entries at every level**.

## 🎭 Visibility modes

### Full

Choices and selected result are visible.

### Mystery wheel — `hidden-wheel`

Wheel labels are concealed; the selected result is revealed afterward.

### Secret result — `hidden-result`

Choices are visible, but the selected result is hidden. The pointer is hidden too, preventing the winning segment from being inferred visually. The character/AI can receive the result privately.

### Blind — `blind`

Neither choices nor result are shown to the user. The character/AI can still receive the result privately.

## 📈 Adaptive levels

Forfeits may be level-gated. A typical five-level design might use:

| Level | Example role |
| ---: | --- |
| 1 | introductory / light |
| 2 | more personal / consequential |
| 3 | stronger scene changes |
| 4 | rare / dramatic |
| 5 | exceptional / major one-shot |

These meanings are pack-design suggestions, not hard-coded content rules.

## 📖 Documentation

- **[Lorebook format & validator guide](docs/LOREBOOK.md)**
- **[AI character-card + Character Lorebook integration prompt](docs/CARD_INTEGRATION_PROMPT.md)**

## 🧩 Architecture

v1.3 moves the active runtime into modular files under `v13/`:

```text
v13/state.js       per-chat state and settings
v13/lorebook.js    parser, validation and eligibility engine
v13/wheel.js       visual wheel, suspense and result delivery
v13/settings.js    settings and validator UI
v13/index.js       commands, message triggers and initialization
```

The previous root `index.js` remains in the repository as the older implementation/reference; `manifest.json` loads the v1.3 runtime.

## 🧪 Current version

**v1.3.0**

Major v1.3 additions: embedded Character Lorebook support, stable `[id=...]` metadata, per-chat one-shot removals, validation/error blocking, level coverage preview, duplicate-ID detection, cooldown deadlock protection, and an expanded AI card-integration workflow.

## License

Released under the **MIT License**. See [LICENSE](LICENSE).
