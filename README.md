# 🎡 Wheel of Fortune for SillyTavern

A cinematic **Wheel of Fortune / Wheel of Forfeits** extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern).

Spin manually, from STscript, or let a character deliberately call the wheel as a tool. Supports weighted outcomes, named wheels, embedded Character Books, secrecy modes, adaptive levels, cooldowns, one-shot results, sound effects, automatic character continuation and a floating preset picker.

## Quick start

### Install

Install this repository from SillyTavern's extension installer:

```text
https://github.com/defuuss/WheelofFortune
```

Reload SillyTavern and open **Extensions → Wheel of Fortune**.

### Test

```text
/wheel
```

A character can deliberately call it with:

```text
Fine. We'll let the wheel decide.
[[SPIN_WHEEL]]
```

or a named wheel:

```text
[[SPIN_WHEEL preset="Studio"]]
```

For a character-triggered spin, the trigger is treated as a tool-call boundary: the token is normally removed from chat, one real wheel result is selected, its instruction is injected into context, and SillyTavern can automatically generate a fresh character response that acts on it.

## v1.5.4: SillyTavern-native Character Book format

For **new Character Book wheel entries**, keep the visible Name/Comment clean and put technical wheel metadata in SillyTavern's **Primary Keywords**.

### Name / Comment

```text
Surprise Category
```

### Primary Keywords

```text
WheelOfFortune
wof:preset=Studio
wof:id=studio_category_01
wof:weight=5
wof:min=1
wof:max=5
```

### Content

```text
Switch the next question or challenge to a fitting surprise category and continue naturally.
```

This maps directly to a Character Card v3 entry's standard `keys` array and keeps the SillyTavern Lorebook editor readable.

### Native metadata

| Primary Keyword | Meaning |
| --- | --- |
| `WheelOfFortune` | Marks the entry as a wheel segment |
| `wof:id=secret_01` | Stable identity; strongly recommended |
| `wof:preset=Studio` | Route to a named wheel |
| `wof:weight=3` | Relative selection weight |
| `wof:min=2` | First eligible level |
| `wof:max=4` | Last eligible level |
| `wof:level=3` | Exact eligible level |
| `wof:cooldown=2` | Leave for two completed spins, then return |
| `wof:once` | Remove after winning for this preset + chat |

Multiple wheel routing is supported:

```text
wof:preset=Studio,Fates
```

No `wof:preset=...` means the entry is shared by all named wheels using that Character Book.

### Legacy syntax is still supported

Existing cards do **not** need to be rewritten immediately. The older bracket format remains compatible:

```text
[WHEEL] [preset=Studio] [id=studio_01] [weight=3] [min=1] [max=5] Studio Challenge
```

The extension can read legacy metadata from Name, Comment or keys. The native Primary Keyword format is simply the recommended format for new cards because it is much cleaner in SillyTavern's UI.

## Floating wheel picker

Click the floating **🎡 button on the right side** to choose a wheel instead of immediately opening only the active preset.

The picker combines:

- presets already configured in the extension;
- named wheels discovered from the active character's embedded Character Book.

Example:

```text
🎡 Choose a wheel

Studio        Character · New
Fates         Character · Preset
Default       Active · Preset
Dares         Preset
```

A Character Book wheel that does not yet exist as an extension preset can be created automatically on first open. The same can happen when the character deliberately requests an explicitly declared wheel such as `Studio`.

## Self-contained character cards

A character can ship all of its wheel definitions inside its own Character Book.

For example, several entries may contain:

```text
WheelOfFortune
wof:preset=Studio
...
```

and others:

```text
WheelOfFortune
wof:preset=Fates
...
```

Then the character can use:

```text
[[SPIN_WHEEL preset="Studio"]]
[[SPIN_WHEEL preset="Fates"]]
```

If the named preset is not configured yet, Wheel of Fortune checks the embedded Character Book. It only auto-creates a missing preset when that exact name is explicitly declared by a valid wheel entry; shared entries cannot authorize arbitrary names.

Modern SillyTavern may keep character cards lazy/shallow-loaded, so the extension explicitly loads the complete character before reading `character_book.entries`.

## Character-triggered tool flow

```text
character message
      ↓
[[SPIN_WHEEL ...]] at end
      ↓
technical trigger removed
      ↓
embedded Character Book checked
      ↓
requested Character wheel created if needed
      ↓
visual wheel spins once
      ↓
real entry Content injected into model context
      ↓
wheel closes
      ↓
fresh character message generated automatically
```

The triggering character message must **not invent the result**. The result does not exist until the extension selects it.

A hard anti-loop guard prevents the automatically generated follow-up from launching another automatic wheel until the user sends a new message.

If automatic generation fails, the selected result stays queued for the next manual generation instead of being discarded.

## One deliberate spin

A wheel opening resolves only one result. There is no post-result **Spin again** button.

For manual use, close/reopen or choose another wheel from the floating picker when a separate spin is actually intended.

## Visibility modes

| Mode | Wheel choices | Selected result |
| --- | --- | --- |
| `full` | visible | visible |
| `hidden-wheel` | hidden | visible |
| `hidden-result` | visible | hidden |
| `blind` | hidden | hidden |

A hidden result can still be injected privately so the character acts on it without exposing the selected outcome to the user.

## Named presets

Each preset can have its own:

- forfeit source;
- appearance/theme;
- visibility mode;
- spin and reveal timing;
- adaptive-level settings;
- audio settings.

Cooldowns, one-shot removals, level and completed-spin count are isolated by **preset + chat**.

## Persistence

Repeatable:

```text
WheelOfFortune
wof:id=truth_01
wof:weight=4
```

Cooldown:

```text
WheelOfFortune
wof:id=confession_01
wof:cooldown=2
```

One-shot:

```text
WheelOfFortune
wof:id=major_turn_01
wof:once
```

Do not combine `wof:once` with `wof:cooldown=N`.

## Adaptive levels

Use either a range:

```text
wof:min=2
wof:max=4
```

or an exact level:

```text
wof:level=3
```

Do not combine exact level with min/max on the same entry.

For a healthy wheel, keep several repeatable entries available at every intended level. If every otherwise-valid entry happens to be on cooldown, the extension includes a safety release to prevent a deadlocked wheel.

## Character Book activation

Wheel-only entries may have normal SillyTavern context activation disabled. Wheel of Fortune reads enabled Character Book entries directly when constructing a wheel.

The extension respects the entry's enabled/disabled state, then applies its own wheel marker, preset, level, cooldown and one-shot rules.

This means ordinary non-wheel Character Book entries can safely remain alongside wheel entries when **tagged-only** import mode is used.

## Commands

| Command | Purpose |
| --- | --- |
| `/wheel` | Spin the active wheel |
| `/wheel preset="Secrets"` | Spin an existing named preset |
| `/wheel visibility=blind level=4 seconds=12` | Customized manual spin |
| `/wheel-open` | Open without spinning |
| `/wheel-preset preset="Secrets"` | Select an existing preset |
| `/wheel-presets` | List configured presets |
| `/wheel-level level=3` | Set current preset/chat level |
| `/wheel-validate` | Validate current Lorebook source |

Manual slash-command spins do not automatically generate another character response. Automatic continuation is reserved for intentional character-triggered spins.

## Validation

Use:

```text
/wheel-validate
```

or **Validate / preview Lorebook** in extension settings.

The validator checks:

- malformed or duplicate stable IDs;
- invalid weights;
- level/range errors;
- duplicate scalar metadata;
- `once` + cooldown conflicts;
- missing titles/content;
- unknown preset routing;
- levels with zero usable entries;
- levels without repeatable baseline entries.

Entries with validation errors do not enter the wheel.

## Audio

Wheel audio is generated locally with the browser Web Audio API; there are no bundled MP3 dependencies.

Features include:

- spin-start/whir sound;
- pointer ticks synchronized to the actual wheel rotation;
- Classic, Soft and Wooden tick styles;
- result/reveal sounds;
- independent master/tick volume controls.

## Preset import / export

The active extension preset can be exported as `.wheel.json` and imported on another installation.

Chat-specific runtime state is intentionally excluded:

- history;
- cooldown progress;
- one-shot removals;
- per-chat spin count;
- adaptive level progress.

For fully portable character setups, embedding wheel entries directly in the Character Book is recommended.

## Documentation

- **[Lorebook / Character Book format](docs/LOREBOOK.md)**
- **[AI prompt for integrating a character card](docs/CARD_INTEGRATION_PROMPT.md)**
- **[Troubleshooting](docs/TROUBLESHOOTING.md)**

## Development / validation

GitHub Actions checks:

- `manifest.json` validity;
- runtime JavaScript syntax;
- manifest target files;
- Node unit tests for trigger parsing, anti-loop behavior, preset validation and native Character Book metadata parsing.

The active runtime is under `v13/`; the directory name is retained for backward compatibility with the modular v1.3 architecture.

## Current version

**v1.5.4**

## License

Released under the **MIT License**. See [LICENSE](LICENSE).
