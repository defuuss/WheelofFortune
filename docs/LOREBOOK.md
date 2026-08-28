# Wheel of Fortune v1.5 — Lorebook format

Wheel of Fortune can read forfeits from:

- a standalone SillyTavern **Lorebook / World Info**; or
- the active character card's embedded **Character Lorebook / Character Book**.

For character cards that should carry their own wheel, the embedded Character Lorebook source is recommended.

## Safe default

Use:

```text
Import entries: Only entries marked [WHEEL]
```

Tagged-only mode prevents unrelated Lorebook entries from becoming wheel segments.

## One Lorebook entry = one wheel segment

Put the short visible wheel label and all metadata in **Comment / Title**.

Put only the actionable roleplay instruction in **Content**.

Example Comment / Title:

```text
[WHEEL] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret
```

Example Content:

```text
Reveal a believable personal secret that fits established characterization and the current scene. Do not contradict known lore. Continue naturally from this result.
```

The wheel displays only:

```text
Reveal a secret
```

The metadata is stripped from the visible label.

## Supported metadata

| Tag | Meaning |
| --- | --- |
| `[WHEEL]` | Marks the entry as a wheel segment. Always recommended. |
| `[id=secret_01]` | Stable identity used for cooldown and one-shot tracking. Strongly recommended. |
| `[preset=Secrets]` | Route the entry only to the named preset. Optional. |
| `[weight=3]` | Positive relative selection weight. |
| `[min=2]` | First eligible intensity level. |
| `[max=4]` | Last eligible intensity level. |
| `[level=3]` | Eligible only at exactly level 3. |
| `[cooldown=2]` | Hide for the next two completed spins of that preset, then return. |
| `[once]` | Remove after winning for the current preset + current chat. |

Aliases `[minlevel=N]` and `[maxlevel=N]` are accepted, but `[min=N]` / `[max=N]` are preferred.

## Stable IDs

Give every wheel entry a stable ID:

```text
[id=truth_01]
[id=challenge_social_02]
[id=plot_twist_01]
```

Rules:

- 1–64 characters;
- letters, numbers, `_`, `-`, `.`, and `:` only;
- no spaces;
- unique within the wheel source;
- keep the same ID if the visible title changes.

Good:

```text
[WHEEL] [id=secret_01] [weight=3] Reveal a secret
```

Later you may rename only the visible title:

```text
[WHEEL] [id=secret_01] [weight=3] Reveal your biggest secret
```

The extension still treats it as the same item.

## Named preset routing

Suppose these presets exist:

```text
General
Truths
Secrets
Consequences
```

Only on `Secrets`:

```text
[WHEEL] [preset=Secrets] [id=secret_01] [weight=3] Reveal a secret
```

On both `Secrets` and `Truths`:

```text
[WHEEL] [preset=Secrets,Truths] [id=confession_01] [weight=2] Confession
```

Shared by every preset using this Lorebook:

```text
[WHEEL] [id=lucky_escape_01] [weight=1] Lucky escape
```

No `[preset=...]` means shared.

Preset matching is case-insensitive. The validator warns about unknown preset names.

## Persistence rules

### Repeatable — stays on the wheel

```text
[WHEEL] [id=truth_01] [weight=4] [min=1] [max=5] Answer honestly
```

No `[once]` and no `[cooldown]` means the item remains available after winning.

### Cooldown — leaves temporarily

```text
[WHEEL] [preset=Secrets] [id=confession_01] [weight=3] [min=2] [max=5] [cooldown=2] Confession
```

After winning, it is unavailable for the next two completed spins of **Secrets in this chat**, then returns.

### One-shot — removed for this preset/chat

```text
[WHEEL] [preset=Consequences] [id=plot_01] [weight=1] [level=5] [once] Major turning point
```

After winning, it disappears for **Consequences in the current chat**. Other presets and chats have independent state.

## Do not combine contradictory metadata

Avoid:

```text
[once] [cooldown=3]
```

Use one or the other.

Avoid:

```text
[level=3] [min=1] [max=5]
```

Use either an exact level or a range.

Avoid duplicate scalar metadata:

```text
[weight=2] [weight=5]
```

## Adaptive five-level example

```text
[WHEEL] [preset=General] [id=light_01] [weight=5] [min=1] [max=2] Light challenge
[WHEEL] [preset=General] [id=choice_01] [weight=4] [min=1] [max=5] Make a choice
[WHEEL] [preset=Secrets] [id=truth_01] [weight=5] [min=1] [max=5] Answer honestly
[WHEEL] [preset=Secrets] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret
[WHEEL] [preset=Consequences] [id=complication_01] [weight=2] [min=3] [max=5] [cooldown=2] Complication
[WHEEL] [preset=Consequences] [id=plot_01] [weight=1] [level=5] [once] Major turning point
[WHEEL] [id=escape_01] [weight=2] [min=1] [max=5] Lucky escape
```

The final `Lucky escape` is shared because it has no preset tag.

A practical five-level interpretation:

| Level | Typical purpose |
| ---: | --- |
| 1 | introductory / light |
| 2 | more personal / consequential |
| 3 | stronger scene changes |
| 4 | rare / dramatic |
| 5 | exceptional / major / one-shot |

These are design suggestions, not hard-coded meanings.

## Keep every level usable

For each intended level of each preset:

- include several eligible entries;
- include at least 2–3 repeatable baseline entries;
- add cooldown entries for variety;
- use `[once]` only for genuinely non-repeatable outcomes.

If every otherwise-valid entry is cooling down, the extension temporarily releases the entry or entries due to return first. This prevents cooldown deadlock, but a healthy baseline is still better design.

## Validator

Run:

```text
/wheel-validate
```

or click **Validate / preview Lorebook**.

Validation covers:

- malformed or duplicate stable IDs;
- unknown preset names;
- invalid or non-positive weights;
- invalid level values;
- `min > max`;
- duplicate metadata;
- `[level]` mixed with `[min]/[max]`;
- `[once]` mixed with cooldown;
- missing Content/title;
- missing `[WHEEL]` in tagged-only mode when wheel-like metadata is present;
- active-preset levels with zero valid entries;
- active-preset levels without repeatable baseline entries.

Entries with validation **errors** do not enter the active wheel. Warnings do not block them.

Validate each preset separately:

```text
/wheel-preset preset="Secrets"
/wheel-validate

/wheel-preset preset="Consequences"
/wheel-validate
```

## Character-triggered wheel and Lorebook Content

When a character deliberately emits:

```text
[[SPIN_WHEEL preset="Secrets"]]
```

v1.5 normally:

1. catches and removes the technical trigger token from chat;
2. spins once;
3. injects the real selected Lorebook Content into model context;
4. generates a fresh character message automatically.

Therefore Content should be directly actionable. It should describe what the character should do after the result is selected.

Good Content:

```text
Reveal a believable secret that fits established characterization and the current scene. Continue naturally from the result.
```

Avoid Content that asks the model to choose another wheel result or emit another trigger.

## Character Book support

Set Source to:

```text
Active character card Lorebook
```

The extension reads the active character's embedded `character_book.entries` directly.

Non-wheel entries may remain in the same Character Book safely when tagged-only import mode is enabled.

## Preset import/export in v1.5

Preset export creates a `.wheel.json` file containing the active preset's configuration.

It intentionally does **not** export per-chat runtime state:

- chat history;
- current cooldown progress;
- one-shot removals;
- per-chat spin count;
- per-chat adaptive level progress.

If an exported preset points to a standalone Lorebook, the Lorebook contents themselves are not bundled. For fully portable character setups, prefer **Active character card Lorebook**.

## Related docs

- [AI character-card integration prompt](CARD_INTEGRATION_PROMPT.md)
- [Troubleshooting](TROUBLESHOOTING.md)
