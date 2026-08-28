# Wheel of Fortune v1.5 — Troubleshooting

Start with the extension's **Diagnostics** panel before opening the browser console.

## Quick checks

1. Confirm the extension version shows **v1.5.0**.
2. Confirm the intended **Active preset** is selected.
3. Check the **Source** and **Eligible entries now** values.
4. For Lorebooks, run:

```text
/wheel-validate
```

5. If you changed extension files or updated from GitHub, reload SillyTavern and use a hard refresh.

## `/wheel` is unknown

The extension did not finish loading or slash-command registration failed.

Open the browser developer console and look for the first red line beginning with:

```text
[Wheel of Fortune]
```

The extension registers commands early, so a settings-panel failure should not normally remove `/wheel`.

## Character trigger does nothing

Check Diagnostics:

```text
Character triggers: Enabled
```

The normal control command is:

```text
[[SPIN_WHEEL]]
```

or, for a named preset:

```text
[[SPIN_WHEEL preset="Secrets"]]
```

If the character uses a preset name that does not exist, the spin is rejected.

## Trigger disappeared from the character message

This is expected in v1.5 when **Hide wheel trigger tokens from chat after detection** is enabled.

The extension removes the technical control token from the stored/rendered message after it catches it. The natural prose before the trigger remains.

Example generated message:

```text
Fine. We'll let the wheel decide.
[[SPIN_WHEEL preset="Secrets"]]
```

becomes:

```text
Fine. We'll let the wheel decide.
```

The trigger has already been executed.

## A second character trigger was ignored

This is the v1.5 **hard anti-loop guard**.

After a character-triggered spin, another automatic character wheel invocation is blocked until the user sends a new message. This prevents:

```text
wheel → auto generation → wheel → auto generation → ...
```

Diagnostics shows:

```text
Anti-loop guard: LOCKED until next user message
```

Send a normal user message to release it.

## Wheel spins but chat does not continue automatically

Check:

```text
Automatic continuation: Enabled
```

If it is disabled, the selected result remains queued for the next manual generation.

If it is enabled but generation fails, the extension deliberately leaves the selected result in prompt context instead of discarding it. Press Generate/send manually once.

The Diagnostics panel will show the last continuation status.

## Secret result is visible when it should not be

Use either:

```text
mode=hidden-result
```

or:

```text
mode=blind
```

For secret-result modes, the extension hides the result UI and pointer so the winning segment cannot be inferred visually. The character can still receive the selected result privately.

## Lorebook has zero eligible entries

Run:

```text
/wheel-validate
```

Common causes:

- `[WHEEL]` missing while tagged-only mode is enabled;
- active level outside the entry's `[min]` / `[max]` range;
- `[level=N]` does not match the current level;
- `[once]` entry already used in this preset/chat;
- entry currently on cooldown;
- `[preset=Name]` does not match the active preset;
- malformed or duplicate `[id=...]`;
- invalid metadata such as `min > max`.

## Cooldowns appear to leave nothing selectable

The extension includes cooldown deadlock protection. If every otherwise-valid entry is cooling down, the entry or entries due to return first are temporarily released.

A well-designed wheel should still contain at least 2–3 repeatable baseline entries at each active level.

## Imported preset references a missing Lorebook

Preset exports include the preset configuration, including the configured Lorebook name, but they do not bundle SillyTavern Lorebook contents.

If the target installation does not have that Lorebook, select an available Lorebook or import/create it separately.

For portable character packages, using **Active character card Lorebook** is usually the better option.

## Imported preset gets a renamed name

Preset names are unique case-insensitively. If `Secrets` already exists, importing another `Secrets` may create:

```text
Secrets (2)
```

This prevents accidental replacement of an existing wheel.

## What preset export does not include

For privacy and predictable sharing, `.wheel.json` exports intentionally exclude runtime chat state:

- chat history;
- current cooldown progress;
- one-shot removals;
- per-chat spin count;
- per-chat adaptive level progress.

## Sound does not play

Browser autoplay policies may suspend Web Audio until the page receives user interaction.

Click somewhere in SillyTavern, then use **Test sound** in Wheel settings.

## Still broken?

Open the browser developer console (F12) and capture the **first** red error mentioning:

```text
[Wheel of Fortune]
```

The first error is usually more useful than later cascading errors.
