# Wheel of Fortune v1.5.4 — Lorebook / Character Book format

Wheel of Fortune can read entries from a standalone SillyTavern **Lorebook / World Info** or from the active character card's embedded **Character Book**.

For character cards, v1.5.4 recommends a format that maps directly to SillyTavern's own editor fields instead of putting technical metadata into the visible entry title.

## Recommended SillyTavern-native format

One Character Book entry = one wheel segment.

### Name / Comment

Keep this human-readable:

```text
Surprise Category
```

### Primary Keywords

Add wheel metadata as separate keywords:

```text
WheelOfFortune
wof:preset=Studio
wof:id=studio_category_01
wof:weight=5
wof:min=1
wof:max=5
```

### Content

Put only the actionable instruction here:

```text
Switch the next question or challenge to a fitting surprise category already compatible with the established game rules. Announce it naturally and continue.
```

This keeps the SillyTavern Lorebook list readable while remaining fully portable in a Character Card v3 `keys` array.

## Native keyword reference

| Primary Keyword | Meaning |
| --- | --- |
| `WheelOfFortune` | Marks the entry as a wheel segment. |
| `wof:id=secret_01` | Stable identity. Strongly recommended. |
| `wof:preset=Secrets` | Route only to this named wheel preset. |
| `wof:weight=3` | Positive relative selection weight. |
| `wof:min=2` | First eligible level. |
| `wof:max=4` | Last eligible level. |
| `wof:level=3` | Eligible only at exactly level 3. |
| `wof:cooldown=2` | Unavailable for the next two completed spins, then returns. |
| `wof:once` | Remove after winning for the current preset + current chat. |

Multiple preset names can be routed with:

```text
wof:preset=Secrets,Truths
```

No `wof:preset=...` keyword means the entry is shared by every preset using that Character Book.

## Examples

### Repeatable

Name:

```text
Answer Honestly
```

Primary Keywords:

```text
WheelOfFortune
wof:id=truth_01
wof:weight=4
wof:min=1
wof:max=5
```

### Cooldown

Name:

```text
Confession
```

Primary Keywords:

```text
WheelOfFortune
wof:preset=Secrets
wof:id=confession_01
wof:weight=3
wof:min=2
wof:max=5
wof:cooldown=2
```

### One-shot

Name:

```text
Major Turning Point
```

Primary Keywords:

```text
WheelOfFortune
wof:preset=Consequences
wof:id=plot_01
wof:weight=1
wof:level=5
wof:once
```

Do not combine `wof:once` with `wof:cooldown=N`. Do not combine `wof:level=N` with `wof:min=N` / `wof:max=N`.

## Backward-compatible bracket format

The older format remains fully supported:

```text
[WHEEL] [preset=Secrets] [id=secret_01] [weight=3] [min=2] [max=5] [cooldown=2] Reveal a secret
```

It may appear in Name, Comment, or keys. v1.5.4 strips this metadata from the wheel label.

However, for new Character Books, the Primary Keyword format is recommended because SillyTavern otherwise displays the long metadata string as the entry title.

Equivalent forms:

| Legacy | Recommended v1.5.4 |
| --- | --- |
| `[WHEEL]` | `WheelOfFortune` |
| `[preset=Studio]` | `wof:preset=Studio` |
| `[id=studio_01]` | `wof:id=studio_01` |
| `[weight=5]` | `wof:weight=5` |
| `[min=1]` | `wof:min=1` |
| `[max=5]` | `wof:max=5` |
| `[level=3]` | `wof:level=3` |
| `[cooldown=2]` | `wof:cooldown=2` |
| `[once]` | `wof:once` |

## SillyTavern activation settings

Wheel entries do not need to participate in normal World Info activation. For embedded wheel-only entries it is reasonable to leave normal context activation disabled; the extension reads enabled Character Book entries directly when it needs to construct a wheel.

The extension respects the entry's enabled/disabled state, but wheel eligibility is controlled by wheel metadata, preset, level, cooldown and one-shot state rather than normal keyword activation.

## Tagged-only mode

Use:

```text
Only entries marked as Wheel entries
```

A native entry is considered marked when its Primary Keywords include `WheelOfFortune`. A legacy entry is marked with `[WHEEL]`.

This prevents ordinary Character Book lore from becoming wheel segments.

## Stable IDs

Every wheel segment should have a unique stable ID such as:

```text
wof:id=studio_category_01
wof:id=fates_debt_01
wof:id=secret_03
```

Use 1–64 characters containing letters, numbers, `_`, `-`, `.`, or `:`. Keep the same ID when renaming the visible entry.

## Self-contained named wheels

A character can ship its own wheel families entirely inside its Character Book.

For example, several entries can contain:

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

The floating 🎡 picker discovers these names. If a Character Book preset is not yet configured in the extension, the picker or an intentional character trigger can create it on first use.

Character trigger:

```text
[[SPIN_WHEEL preset="Studio"]]
```

## Levels and persistence

State is isolated by **preset + chat**.

- no cooldown/once keyword → stays available;
- `wof:cooldown=2` → leaves for two completed spins, then returns;
- `wof:once` → removed for that preset in the current chat after winning.

For each intended level, keep at least 2–3 repeatable baseline entries. The extension includes cooldown deadlock protection, but a healthy pool gives better results.

## Validation

Run:

```text
/wheel-validate
```

or use **Validate / preview Lorebook** in settings.

The validator checks stable IDs, duplicate metadata, weights, levels, ranges, cooldown/once conflicts, missing titles/content, preset routing and level coverage.

## Character-triggered result flow

When the character emits a valid trigger at the end of its message, Wheel of Fortune resolves one real result, injects that entry's Content into model context and can automatically generate a fresh character message that acts on it.

Therefore Content should be directly actionable and should never ask the model to choose another wheel result.

## Related docs

- [AI character-card integration prompt](CARD_INTEGRATION_PROMPT.md)
- [Troubleshooting](TROUBLESHOOTING.md)
