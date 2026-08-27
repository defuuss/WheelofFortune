# 🎡 Wheel of Fortune for SillyTavern

A cinematic, animated **Wheel of Fortune / Wheel of Forfeits** extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern).

Built for roleplay: spin manually, trigger it from STscript, let the character deliberately launch it from dialogue, or populate the wheel from a SillyTavern Lorebook. The wheel can progressively change as the roleplay intensity level changes.

## ✨ Highlights

- 🎡 **Large on-screen animated wheel** with weighted segments and smooth deceleration.
- ⏳ **Long suspense spins** with 11–16 full rotations plus a configurable pause after the wheel stops.
- 💥 **Large dramatic result reveal** after the selected forfeit is chosen.
- 🎭 **Four visibility modes**:
  - **Full** — choices and result visible;
  - **Mystery wheel** — choices hidden, result visible;
  - **Secret result** — choices visible, result hidden;
  - **Blind** — choices and result both hidden.
- 🤫 Secret results can be delivered privately to the character/AI without leaking through the UI, history, toast, pointer, or a visible system message.
- ⚖️ **Weighted forfeits** with optional one-shot removal.
- 🔁 **Cooldowns** — keep a selected forfeit off the wheel for N subsequent spins.
- 📈 **Adaptive intensity levels** stored independently per SillyTavern chat.
- 📚 **Lorebook / World Info integration** with level and cooldown metadata.
- 🤖 **Character-triggered spins with options**, including secret modes, intensity level, and spin duration.
- 🎨 Themes, colors, pointer, wheel size, direction, probability labels, and floating launcher customization.
- 📱 Responsive desktop/mobile UI.
- 💾 Uses SillyTavern extension settings; no external server or third-party JS library required.

## 📦 Installation

In SillyTavern:

1. Open **Extensions**.
2. Choose **Install Extension**.
3. Install from:

```text
https://github.com/defuuss/WheelofFortune
```

4. Reload SillyTavern if requested.
5. Open **Extensions → Wheel of Fortune**.

## 🎮 Basic commands

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

Completely blind spin:

```text
/wheel visibility=blind
```

Request a stronger level and longer spin for one spin:

```text
/wheel visibility=blind level=4 seconds=12
```

Set the persistent level for the current chat:

```text
/wheel-level level=3
```

## 🎭 Visibility and secrecy

### Full

The user can see all wheel labels and the final result.

### Mystery wheel — `hidden-wheel`

The wheel spins on screen, but the segment labels are concealed for the entire spin. The selected result is revealed dramatically afterward.

### Secret result — `hidden-result`

The user may see the available wheel choices, but the result remains secret. The selection pointer is hidden so the final segment cannot be inferred visually. If **silently tell the character/AI** is enabled, the chosen forfeit is injected privately into model context.

### Blind — `blind`

Neither the possible forfeits nor the final selected forfeit are shown to the user. The character/AI can still privately receive the result.

Secret results are also masked in the wheel's recent-history display.

## 🤖 Character-triggered wheel

When character triggering is enabled, the model can intentionally output control tokens such as:

```text
[[SPIN_WHEEL]]
[[SPIN_WHEEL mode=hidden-wheel]]
[[SPIN_WHEEL mode=hidden-result]]
[[SPIN_WHEEL mode=blind]]
[[SPIN_WHEEL level=3]]
[[SPIN_WHEEL mode=blind level=4 seconds=12]]
```

The extension can inject instructions explaining these controls to the active character. It explicitly tells the model not to quote trigger tokens casually and not to reveal hidden results.

A ready-made prompt for adding this behavior to a SillyTavern character card is included in **[docs/CARD_INTEGRATION_PROMPT.md](docs/CARD_INTEGRATION_PROMPT.md)**.

## 📈 Adaptive forfeits over time

Each forfeit can have:

- a **minimum level**;
- a **maximum level**;
- a **weight**;
- a **cooldown in spins**;
- optional **one-shot** removal.

When adaptive mode is enabled, the extension stores a separate level and spin count for each SillyTavern chat. It can automatically increase the level after a configurable number of completed spins.

That means the wheel can evolve naturally:

| Level | Example purpose |
| ---: | --- |
| 1 | harmless / introductory outcomes |
| 2 | more personal challenges |
| 3 | stronger consequences |
| 4 | dramatic or rare events |
| 5 | major one-shot / plot-changing events |

A level-1 forfeit can disappear later, while stronger forfeits automatically become eligible as the level rises.

## 📚 Lorebook-powered adaptive wheels

Use a normal SillyTavern Lorebook entry title/comment like:

```text
[WHEEL] [weight=3] [min=2] [max=4] [cooldown=2] Tell a secret
```

Or make an outcome appear only at level 5:

```text
[WHEEL] [weight=1] [level=5] [once] Major plot twist
```

Supported metadata:

- `[WHEEL]`
- `[weight=3]`
- `[min=2]` / `[minlevel=2]`
- `[max=4]` / `[maxlevel=4]`
- `[level=3]`
- `[cooldown=2]`
- `[once]`

See **[docs/LOREBOOK.md](docs/LOREBOOK.md)** for the full design guide.

## 🎨 Customization

The settings panel includes:

- wheel title;
- Neon, Classic, Pastel, Ocean, Fire, Monochrome, or custom colors;
- center/accent color;
- pointer color;
- label color;
- wheel size;
- clockwise, counter-clockwise, or random direction;
- optional probability percentages;
- floating 🎡 launcher;
- spin duration;
- post-stop reveal delay;
- default visibility behavior.

## 🧩 Architecture

The extension uses SillyTavern's native extension APIs for:

- settings persistence;
- World Info / Lorebook loading;
- extension prompt injection;
- message events;
- slash commands / STscript;
- standard third-party extension loading.

The repository still contains the original standalone browser prototype (`index.html`, `app.js`, `styles.css`). The SillyTavern extension itself uses `manifest.json`, `index.js`, `settings.html`, and `style.css`.

## 🧪 Current version

**v1.2.0**

Major v1.2 additions: cinematic result reveal, longer suspense spins, four secrecy modes, advanced character trigger options, adaptive per-chat intensity levels, level-gated forfeits, and cooldowns.

## ❤️ Contributing

Bug reports, wheel ideas, UI improvements, Lorebook packs, and pull requests are welcome.

## License

Released under the **MIT License**. See [LICENSE](LICENSE).
