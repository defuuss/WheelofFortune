# Lorebook-powered wheels

Wheel of Fortune can use a normal SillyTavern Lorebook (World Info) as the source of wheel segments. This is the recommended approach for larger roleplay wheels because forfeits can be loaded and removed automatically by intensity level without hardcoding them into the extension.

## Recommended format

Create one Lorebook entry per possible forfeit. Put the short visible wheel label in the **Comment / Title** field and the full instruction in the **Content** field.

When the extension is set to **Only entries marked `[WHEEL]`**, add `[WHEEL]` to the entry title/comment or one of its keys.

Example:

**Comment / Title**

```text
[WHEEL] [weight=3] [min=2] [max=4] [cooldown=2] Tell a secret
```

**Content**

```text
The selected character must reveal a believable secret they have been trying to hide. It should fit established characterization and current story context.
```

## Persistence: stay, leave temporarily, or disappear permanently

Lorebook forfeits have three useful persistence behaviors.

### 1. Stay on the wheel

This is the default. Do **not** add `[once]` or a cooldown if the forfeit should remain eligible after it is selected.

```text
[WHEEL] [weight=3] Tell a secret
```

After it wins, it stays available and can be selected again on a later spin.

### 2. Leave temporarily, then return

Use `[cooldown=N]` when the forfeit should disappear for a number of completed spins and later come back automatically.

```text
[WHEEL] [weight=3] [cooldown=2] Tell a secret
```

If this result wins, it is excluded from the next two completed spins and then becomes eligible again, provided its level range is still valid.

### 3. Remove permanently after it wins

Use `[once]` for true one-shot outcomes.

```text
[WHEEL] [weight=1] [once] Major plot twist
```

When **Honor `[once]` / one-shot entries** is enabled in the extension settings, the entry is permanently removed from the active wheel after it is selected.

This distinction is useful when building adaptive wheels: common forfeits can repeat, memorable outcomes can have cooldowns, and irreversible plot events can be one-shot.

## Metadata tags

| Tag | Meaning |
| --- | --- |
| `[WHEEL]` | Include the entry when using tagged-only mode. |
| `[weight=3]` | Relative probability weight. Default is `1`. |
| `[min=2]` | Entry becomes eligible starting at level 2. |
| `[max=4]` | Entry stops being eligible after level 4. |
| `[level=3]` | Shortcut for an entry that is eligible only at exactly level 3. |
| `[cooldown=2]` | After selection, keep this entry off the wheel for the next 2 completed spins, then return it automatically. |
| `[once]` | Permanently remove the entry after it is selected, when one-shot removal is enabled. |

`[minlevel=2]` and `[maxlevel=4]` are also accepted.

Weights are relative. An entry with `weight=4` is four times as likely to be selected as one with `weight=1`, provided both are currently eligible.

## Adaptive intensity example

A useful five-level wheel might look like this:

```text
[WHEEL] [weight=5] [min=1] [max=2] [cooldown=1] Harmless question
[WHEEL] [weight=4] [min=1] [max=3] Small challenge
[WHEEL] [weight=3] [min=2] [max=4] [cooldown=2] Personal confession
[WHEEL] [weight=2] [min=3] [max=5] [cooldown=2] Major complication
[WHEEL] [weight=1] [min=4] [max=5] [once] Major plot twist
[WHEEL] [weight=1] [min=1] [max=5] [cooldown=2] Lucky escape
```

At level 1 only the mild entries appear. As the chat's wheel level rises, new entries are automatically loaded while lower-level entries can disappear. The wheel therefore changes over time without editing the Lorebook during play.

Notice that **Small challenge** has no `[once]` and no cooldown, so it remains on the wheel whenever its level range is active. **Personal confession** temporarily disappears for two spins after selection. **Major plot twist** is removed permanently after it wins.

## Per-chat progression

Adaptive progression is stored separately for each SillyTavern chat.

The extension can:

- start a chat at a configurable default level;
- automatically increase one level after every N completed spins;
- let you manually raise or lower the current chat level;
- let a slash command or character trigger request a specific level for a single spin;
- apply per-entry cooldowns;
- permanently remove `[once]` entries;
- leave ordinary Lorebook entries on the wheel indefinitely.

Use `/wheel-level level=3` to change the active chat level manually.

## Character-triggered spins

The character can deliberately launch the visual wheel with control tokens:

```text
[[SPIN_WHEEL]]
[[SPIN_WHEEL mode=hidden-wheel]]
[[SPIN_WHEEL mode=hidden-result]]
[[SPIN_WHEEL mode=blind]]
[[SPIN_WHEEL level=3]]
[[SPIN_WHEEL mode=blind level=4 seconds=12]]
```

The advanced token supports:

- `mode=full`
- `mode=hidden-wheel`
- `mode=hidden-result`
- `mode=blind`
- `level=N`
- `seconds=N`
- `result=system|prompt|private`

When the **character hint** option is enabled, the extension tells the active model how to use these controls and warns it not to reveal hidden results.

## Visibility modes

### Full

The wheel labels and selected result are visible.

### Mystery wheel (`hidden-wheel`)

The user sees a spinning wheel but cannot see what the segments contain. The selected result is revealed after the spin.

### Secret result (`hidden-result`)

The user can see all wheel choices, but the selected result is hidden. If **silently tell the character/AI** is enabled, the extension injects the secret result into model context without revealing it to the user.

### Blind

Neither the wheel choices nor the selected result are shown. The character can still privately receive the selected result.

Secret results are masked in the on-screen history and are never posted as visible system messages.

## Designing good adaptive wheels

A practical pattern is:

- level 1: harmless / introductory outcomes;
- level 2: more personal or consequential outcomes;
- level 3: stronger roleplay changes;
- level 4: rare or dramatic outcomes;
- level 5: major one-shot events or plot-changing consequences.

Use ordinary repeatable entries for the wheel's core content. Use cooldowns on memorable outcomes so the wheel feels varied. Reserve `[once]` for events that truly should never repeat in that chat/setup.
