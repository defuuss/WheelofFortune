# Wheel of Fortune v1.4 — Lorebook format

Wheel of Fortune can load forfeits from a standalone SillyTavern **Lorebook / World Info** or directly from the active character card's embedded **Character Lorebook / Character Book**.

v1.4 also supports **multiple named wheel presets**. A single Lorebook can contain shared entries plus entries routed only to specific presets.

## Recommended safety setting

Use:

```text
Import entries: Only entries marked [WHEEL]
```

Tagged-only mode prevents unrelated Lorebook entries from accidentally becoming wheel segments.

## One Lorebook entry = one wheel segment

Put the short wheel label and all metadata in the entry's **Comment / Title** field. Put only the detailed roleplay instruction in **Content**.

### Comment / Title

```text
[WHEEL] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret
```

### Content

```text
Reveal a believable personal secret that fits established characterization and the current scene. Do not contradict known lore.
```

The wheel displays only `Reveal a secret`; metadata is stripped from the visible label.

## Official metadata

| Tag | Meaning |
| --- | --- |
| `[WHEEL]` | Marks the entry as a wheel segment. Always recommended. |
| `[id=secret_01]` | Stable identity for cooldown / one-shot tracking. Strongly recommended. |
| `[preset=Secrets]` | Route the entry only to the named preset. Optional. |
| `[weight=3]` | Relative selection weight. Must be positive. |
| `[min=2]` | First eligible intensity level. |
| `[max=4]` | Last eligible intensity level. |
| `[level=3]` | Eligible only at exactly level 3. |
| `[cooldown=2]` | Hide for the next two completed spins of that preset, then return. |
| `[once]` | Permanently remove after winning for the current preset + current chat. |

`[minlevel=N]` and `[maxlevel=N]` are accepted aliases; `[min=N]` / `[max=N]` are preferred.

## Named preset routing

Suppose the extension has these presets:

```text
General
Truths
Secrets
Consequences
```

### Entry only on Secrets

```text
[WHEEL] [preset=Secrets] [id=secret_01] [weight=3] Reveal a secret
```

### Entry on both Secrets and Truths

```text
[WHEEL] [preset=Secrets,Truths] [id=confession_01] [weight=2] Confession
```

### Shared entry

```text
[WHEEL] [id=lucky_escape_01] [weight=1] Lucky escape
```

An entry with **no `[preset=...]` tag is shared** by every preset that uses that Lorebook source.

You can also use `[preset=*]` or `[preset=all]` explicitly for a shared entry, but omitting the tag is cleaner.

Preset names are matched case-insensitively. The validator warns when an entry targets a preset that does not exist.

## Stable IDs

Use a stable ID on every wheel entry:

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
- do not change the ID when you rename the visible title.

## Persistence types

### Repeatable — stays on the wheel

```text
[WHEEL] [id=truth_01] [weight=4] [min=1] [max=5] Answer honestly
```

No `[once]` and no `[cooldown]` means the item remains available after winning.

### Cooldown — leaves temporarily, then returns

```text
[WHEEL] [preset=Secrets] [id=confession_01] [weight=3] [min=2] [max=5] [cooldown=2] Confession
```

After it wins, it is unavailable for the next two completed spins of **Secrets in this chat**, then returns.

### One-shot — removed for this preset and chat

```text
[WHEEL] [preset=Consequences] [id=plot_01] [weight=1] [level=5] [once] Major turning point
```

After it wins, it disappears for **Consequences in the current chat**. A different preset or different chat has independent state.

The **Reset wheel state for this chat** button resets the active preset's level, spin count, cooldowns and one-shot removals.

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

Use exact level OR a range.

Do not repeat a scalar field such as:

```text
[weight=2] [weight=5]
```

Multiple `[preset=...]` tags are accepted, though a single comma-separated `[preset=Secrets,Truths]` is easier to read.

## Adaptive five-level example

```text
[WHEEL] [preset=General] [id=light_01] [weight=5] [min=1] [max=2] Light challenge
[WHEEL] [preset=General] [id=choice_01] [weight=4] [min=1] [max=5] Make a choice
[WHEEL] [preset=Secrets] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret
[WHEEL] [preset=Secrets] [id=truth_01] [weight=5] [min=1] [max=5] Answer honestly
[WHEEL] [preset=Consequences] [id=complication_01] [weight=2] [min=3] [max=5] [cooldown=2] Complication
[WHEEL] [preset=Consequences] [id=plot_01] [weight=1] [level=5] [once] Major turning point
[WHEEL] [id=escape_01] [weight=2] [min=1] [max=5] Lucky escape
```

The final `Lucky escape` has no preset tag, so it is shared by General, Secrets and Consequences if they all use this Lorebook.

## Cooldown deadlock protection

If every otherwise-valid entry at a level is cooling down, the extension temporarily releases the entry or entries whose cooldown expires first. This prevents zero selectable segments from permanently locking a wheel.

Still include at least **2–3 always-repeatable entries at every intended level of each preset**.

## Validator

Run:

```text
/wheel-validate
```

or click **Validate / preview Lorebook**.

Validation includes:

- duplicate/malformed stable IDs;
- unknown preset names;
- invalid weights and levels;
- `min > max`;
- duplicate metadata fields;
- `[level]` mixed with `[min]/[max]`;
- `[once]` mixed with cooldown;
- missing Content/title;
- missing `[WHEEL]` in tagged-only mode when wheel metadata is detected;
- active-preset levels with zero valid entries;
- active-preset levels with no repeatable baseline entries.

Entries with validation **errors** are excluded from the active wheel. Warnings do not block them.

Validate each named preset individually:

```text
/wheel-preset preset="Secrets"
/wheel-validate

/wheel-preset preset="Consequences"
/wheel-validate
```

## Character Lorebook support

Set Source to:

```text
Active character card Lorebook
```

The extension reads the active character's embedded `character_book.entries`. This lets a character card travel with one Lorebook containing multiple wheel presets.

Non-wheel entries can safely remain in the same Character Lorebook when tagged-only mode is used.

## Character-triggered presets

A character may deliberately launch specific wheels:

```text
[[SPIN_WHEEL]]
[[SPIN_WHEEL preset="Secrets"]]
[[SPIN_WHEEL preset="Secrets" mode=hidden-wheel]]
[[SPIN_WHEEL preset="Consequences" mode=hidden-result]]
[[SPIN_WHEEL preset="Chaos" mode=blind level=4 seconds=12]]
```

The extension's character hint includes the actual configured preset names and instructs the model not to invent or reveal internal preset metadata.

See **[CARD_INTEGRATION_PROMPT.md](CARD_INTEGRATION_PROMPT.md)** for the prompt that teaches another AI how to modify a SillyTavern card and its Character Lorebook correctly.
