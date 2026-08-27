# Wheel of Fortune v1.3 — Lorebook format

Wheel of Fortune can load forfeits from either:

1. a selected standalone SillyTavern **Lorebook / World Info**, or
2. the active character card's embedded **Character Lorebook / Character Book**.

For character cards that should travel with their own wheel, the embedded Character Lorebook source is recommended.

## Recommended safety setting

Use:

```text
Import entries: Only entries marked [WHEEL]
```

Tagged-only mode prevents unrelated Lorebook entries from accidentally becoming wheel segments.

## One Lorebook entry = one wheel segment

Put the short wheel label and all metadata in the entry's **Comment / Title** field.

Put only the detailed roleplay instruction in the entry's **Content** field.

Example:

### Comment / Title

```text
[WHEEL] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret
```

### Content

```text
The selected character must reveal a believable personal secret that fits established characterization and the current scene. Do not contradict known lore.
```

The metadata is removed from the visible wheel label, so the wheel displays only:

```text
Reveal a secret
```

## Official metadata

| Tag | Meaning |
| --- | --- |
| `[WHEEL]` | Marks the entry as a wheel segment. Always recommended. |
| `[id=secret_01]` | Stable identity for cooldown / one-shot tracking. Strongly recommended. |
| `[weight=3]` | Relative selection weight. Must be positive. |
| `[min=2]` | First intensity level where the entry is eligible. |
| `[max=4]` | Last intensity level where the entry is eligible. |
| `[level=3]` | Entry is eligible only at exactly level 3. |
| `[cooldown=2]` | Hide the entry for the next 2 completed spins after it wins, then return it. |
| `[once]` | Permanently remove the entry after it wins for the current chat. |

Aliases `[minlevel=N]` and `[maxlevel=N]` are accepted, but `[min=N]` / `[max=N]` are preferred for new packs.

## Stable IDs

A stable ID should be supplied on every wheel entry:

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
- do not change the ID merely because the visible title changes.

Good:

```text
[WHEEL] [id=secret_01] [weight=3] Reveal a secret
```

Later you may safely rename the visible title:

```text
[WHEEL] [id=secret_01] [weight=3] Reveal your biggest secret
```

The extension still recognizes it as the same wheel item.

## Persistence types

There are three intended behaviors.

### Repeatable — stays on the wheel

```text
[WHEEL] [id=truth_01] [weight=4] [min=1] [max=5] Answer honestly
```

No `[once]` and no `[cooldown]` means the item remains available after winning.

### Cooldown — leaves temporarily, then returns

```text
[WHEEL] [id=confession_01] [weight=3] [min=2] [max=5] [cooldown=2] Confession
```

After it wins, it is unavailable for the next two completed spins and then automatically returns.

### One-shot — permanently removed for this chat

```text
[WHEEL] [id=plot_01] [weight=1] [level=5] [once] Major turning point
```

After it wins, it disappears for the current SillyTavern chat. A different/new chat has its own independent one-shot state.

The **Reset wheel state for this chat** button clears the current chat's level, spin count, cooldowns, and one-shot removals.

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

Use exact level:

```text
[level=3]
```

or a range:

```text
[min=1] [max=5]
```

Do not define the same field more than once:

```text
[weight=2] [weight=5]
```

is invalid.

## Adaptive five-level example

```text
[WHEEL] [id=light_01] [weight=5] [min=1] [max=2] Light challenge
[WHEEL] [id=truth_01] [weight=5] [min=1] [max=3] Answer honestly
[WHEEL] [id=choice_01] [weight=4] [min=1] [max=5] Make a choice
[WHEEL] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret
[WHEEL] [id=role_01] [weight=3] [min=2] [max=5] [cooldown=1] Role reversal
[WHEEL] [id=complication_01] [weight=2] [min=3] [max=5] [cooldown=2] Complication
[WHEEL] [id=rare_01] [weight=1] [min=4] [max=5] [cooldown=3] Rare event
[WHEEL] [id=plot_01] [weight=1] [level=5] [once] Major turning point
[WHEEL] [id=escape_01] [weight=2] [min=1] [max=5] Lucky escape
```

A practical interpretation is:

| Level | Purpose |
| ---: | --- |
| 1 | light / introductory |
| 2 | more personal / consequential |
| 3 | stronger scene changes |
| 4 | rare / dramatic |
| 5 | major / exceptional / one-shot |

These are design suggestions, not hard-coded meanings. A pack can define another theme as long as its ranges are internally consistent.

## Avoid cooldown deadlocks

A poorly designed level might contain only:

```text
A [cooldown=5]
B [cooldown=5]
```

If both are cooling down, older versions could reach zero eligible entries and become stuck because no spin could advance the cooldown counter.

v1.3 includes a safety mechanism: if every otherwise-valid entry is cooling down, the entry or entries whose cooldown ends first are temporarily released for that spin.

This prevents the wheel from locking, but it is still better design to include at least **2–3 always-repeatable entries at every level**.

## Validator

Before using or sharing a wheel pack, run:

```text
/wheel-validate
```

or click:

```text
Validate / preview Lorebook
```

The validator checks for problems including:

- duplicate stable IDs;
- malformed IDs;
- invalid / non-positive weights;
- invalid level values;
- `min > max`;
- duplicate metadata fields;
- `[level]` mixed with `[min]` / `[max]`;
- `[once]` mixed with cooldown;
- missing Content;
- missing visible titles;
- missing `[WHEEL]` when wheel-like metadata is detected in tagged-only mode;
- levels with zero valid entries;
- levels with no repeatable baseline entries.

It also shows a per-level table with the number of:

- total entries;
- repeatable entries;
- cooldown entries;
- one-shot entries.

Entries containing validation **errors** are not allowed onto the active wheel. Warnings do not block an entry.

## Character Lorebook support

Set the extension source to:

```text
Active character card Lorebook
```

The extension reads the active SillyTavern character's embedded `character_book.entries` directly. This makes the wheel data portable with the character card.

Both common entry representations are supported:

- standalone World Info entries using fields such as `key`, `uid`, `disable`, `comment`, and `content`;
- Character Book entries using fields such as `keys`, `id`, `enabled`, `comment` / `name`, and `content`.

Non-wheel entries can stay in the same Character Lorebook safely when tagged-only import mode is used.

## Character-triggered spins

A character may deliberately launch the wheel with:

```text
[[SPIN_WHEEL]]
[[SPIN_WHEEL mode=hidden-wheel]]
[[SPIN_WHEEL mode=hidden-result]]
[[SPIN_WHEEL mode=blind]]
[[SPIN_WHEEL level=3]]
[[SPIN_WHEEL mode=blind level=4 seconds=12]]
```

The extension can inject a compact instruction teaching the active character these controls. The model is instructed not to expose hidden results or internal Lorebook metadata.

See **[CARD_INTEGRATION_PROMPT.md](CARD_INTEGRATION_PROMPT.md)** for a ready-made prompt that teaches another AI how to modify a SillyTavern card and build its Character Lorebook correctly.
