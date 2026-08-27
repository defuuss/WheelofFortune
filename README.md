# 🎡 Wheel of Fortune for SillyTavern

A polished, animated **Wheel of Fortune / Wheel of Forfeits** extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern).

It is designed for roleplay: spin manually, call it from STscript, let a character intentionally trigger it from dialogue, or populate the wheel directly from a SillyTavern Lorebook.

> The repository originally contained a standalone browser prototype. That prototype is still present (`index.html`, `app.js`, `styles.css`), while the root extension files (`manifest.json`, `index.js`, `settings.html`, `style.css`) provide the full SillyTavern integration.

## ✨ Features

- 🎡 **Large animated visual wheel** with weighted segments and smooth deceleration.
- 🙈 **Hidden spin mode** — choices stay concealed until the wheel lands.
- ⚖️ **Weighted forfeits** — make common events frequent and dramatic events rare.
- 📝 **Manual forfeit editor** directly in SillyTavern settings.
- 📚 **Lorebook / World Info integration** — use existing SillyTavern content as wheel entries.
- 🧠 **Character-triggered spins** — a character can deliberately output a special token such as `[[SPIN_WHEEL]]` and launch the wheel itself.
- ⌨️ **STscript / slash commands** — `/wheel`, `/wheel hidden=true`, `/wheel mode=private`, `/wheel-open`.
- 👁️ **Three result modes**:
  - post the result visibly as a system message;
  - inject the result silently into the next generation;
  - keep the result private in the wheel UI.
- 1️⃣ **One-shot entries** — optionally remove a forfeit after it has been selected.
- 🕓 **Recent spin history** saved in extension settings.
- 📱 **Responsive UI** for desktop and mobile layouts.
- 💾 Settings persist through SillyTavern's extension settings system.

## 📦 Installation

In SillyTavern:

1. Open **Extensions**.
2. Open **Install Extension**.
3. Install from this repository URL:

```text
https://github.com/defuuss/WheelofFortune
```

4. Restart or reload SillyTavern if requested.
5. Open **Extensions → Wheel of Fortune** and configure your wheel.

During development, install the `sillytavern-extension-v1` branch or merge that branch into `main` first.

## 🎮 Basic use

Open the extension settings and click **Open wheel** or **Spin now**.

You can also use STscript:

```text
/wheel
/wheel hidden=true
/wheel mode=private
/wheel mode=prompt
/wheel-open
```

The `/wheel` command returns the title of the selected forfeit, so it can also participate in larger STscript flows.

## 🤖 Let the character spin the wheel

Enable **Allow text trigger** and **Tell the character how to trigger the wheel**.

The default trigger is:

```text
[[SPIN_WHEEL]]
```

The extension adds a lightweight instruction to the active roleplay context telling the character that it may output this exact token when it intentionally wants to spin.

When an assistant message contains the token, Wheel of Fortune automatically opens and spins.

You can replace the token with anything distinctive, for example:

```text
<WHEEL_SPIN>
!spin-the-wheel!
[[FORTUNE]]
```

A distinctive token is recommended to avoid accidental activation.

## 📚 Lorebook-powered forfeits

Set **Forfeit source** to **SillyTavern Lorebook / World Info** and choose a Lorebook.

The recommended mode imports only entries tagged with `[WHEEL]`.

Example Lorebook entry title/comment:

```text
[WHEEL] [weight=3] Tell an embarrassing secret
```

Entry content:

```text
The selected character must reveal an embarrassing but believable secret that fits the established roleplay.
```

Optional metadata:

- `[WHEEL]` — include the entry in tagged-only mode.
- `[weight=3]` — relative selection weight. Default is `1`.
- `[once]` — remove this entry after it is selected.

See **[docs/LOREBOOK.md](docs/LOREBOOK.md)** for the complete setup guide.

## 👁️ Result modes

### System message

The result appears visibly in the SillyTavern chat as a Wheel of Fortune system message.

### Silent prompt injection

The result is added to SillyTavern's extension prompt for the next generation. This is ideal for immersive roleplay because the model receives the forfeit without adding an extra visible chat message.

### Private

The wheel reveals the result only in the visual UI. Nothing is injected into the model context.

## 🙈 Hidden spins

Enable **Hidden spin** or run:

```text
/wheel hidden=true
```

The labels are hidden while the wheel spins. Only once it stops are the choices and selected forfeit revealed.

This is useful when the player should not know the possible outcomes beforehand.

## ⚖️ How weighting works

Weights are relative rather than percentages.

| Forfeit | Weight | Relative chance |
| --- | ---: | ---: |
| Nothing happens | 5 | Very common |
| Truth | 3 | Common |
| Dare | 3 | Common |
| Confession | 2 | Uncommon |
| Major plot twist | 1 | Rare |

The visual segment sizes match the configured weights.

## 🧩 Architecture

The extension intentionally uses SillyTavern's native extension APIs:

- extension settings for persistence;
- World Info APIs for Lorebook loading;
- extension prompts for character trigger hints and silent result injection;
- message events for character/user trigger detection;
- slash command registration for STscript support;
- standard third-party extension manifest and template loading.

No external server and no third-party JavaScript dependencies are required.

## 🛣️ Planned enhancements

Ideas for later releases:

- multiple named wheel presets;
- import/export wheel packs;
- per-character and per-chat wheel presets;
- sound effects and pointer ticks;
- configurable wheel themes;
- cooldowns for character-triggered spins;
- dependency/condition rules between outcomes;
- Quick Reply integration;
- optional automatic generation immediately after a silent result;
- richer Lorebook filters and tags.

## 🧪 Current status

**v1.0 development branch:** `sillytavern-extension-v1`

The extension implementation is ready for installation/testing against a current SillyTavern build. Because SillyTavern evolves quickly, bug reports should include the SillyTavern version and browser console error if one occurs.

## ❤️ Contributing

Bug reports, ideas, UI improvements, and pull requests are welcome.

If you create a particularly good roleplay wheel/Lorebook format, feel free to share it as an example pack.

## License

A license file has not yet been selected for the repository. Add one before distributing derivative builds if you want explicit reuse terms.
