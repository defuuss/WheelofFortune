# Lorebook-powered wheels

Wheel of Fortune can use a normal SillyTavern Lorebook (World Info) as the source of wheel segments. This is useful when you want the wheel content to travel with a roleplay setup instead of maintaining a second list inside the extension.

## Recommended format

Create one Lorebook entry per possible forfeit. Put the visible wheel title in the **Comment / Title** field and the full instruction in the **Content** field.

When the extension is set to **Only entries marked `[WHEEL]`**, add `[WHEEL]` to the entry title/comment or one of its keys.

Example:

**Comment / Title**

```text
[WHEEL] [weight=3] Tell a secret
```

**Content**

```text
The selected character must reveal a believable secret they have been trying to hide. It should fit established characterization and current story context.
```

## Metadata tags

The extension recognizes these tags in the Lorebook entry title/comment or keys:

| Tag | Meaning |
| --- | --- |
| `[WHEEL]` | Marks the entry as part of the wheel when using tagged-only mode. |
| `[weight=3]` | Sets a relative selection weight. Any positive number is accepted. Default is `1`. |
| `[once]` | Removes the entry from the active wheel after it is selected, when **Honor remove-after-selected entries** is enabled. |

Weights are relative. An entry with `weight=4` is four times as likely to be selected as an entry with `weight=1`.

## Example wheel Lorebook

```text
[WHEEL] [weight=4] Answer honestly
[WHEEL] [weight=3] Take a dare
[WHEEL] [weight=2] Unexpected confession
[WHEEL] [weight=1] [once] Major plot twist
[WHEEL] [weight=1] Lucky escape
```

Each entry's actual instruction belongs in its Lorebook **Content** field. This keeps labels short enough to look good on the wheel while allowing detailed roleplay instructions.

## Character-triggered spins

The extension can tell the active character that it may deliberately trigger a spin by outputting the configured trigger token, for example:

```text
[[SPIN_WHEEL]]
```

When SillyTavern receives a character response containing that token, the extension opens and spins the visual wheel. You can disable this prompt injection at any time from the extension settings.

## Result modes

- **System message** — the selected forfeit is visibly posted to the chat.
- **Silent prompt injection** — the result is injected into SillyTavern context for the next generation without posting a visible system message.
- **Private** — the result only appears in the Wheel UI and a local toast notification.

For roleplay, silent prompt injection is usually the cleanest choice when you do not want a system card interrupting the transcript.
