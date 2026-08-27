# AI prompt: integrate Wheel of Fortune v1.3 into a SillyTavern character card

Use the prompt below with an AI that is creating or editing a SillyTavern character card. It tells the AI how to add both the **character behavior** and the **Character Lorebook / Character Book wheel entries**.

```text
You are editing or creating a SillyTavern character card that will be used with the "Wheel of Fortune" extension v1.3 or newer.

Your job has TWO parts:

A) Integrate the Wheel of Fortune into the character's persistent roleplay behavior.
B) Build or extend the character's embedded Character Lorebook / Character Book with valid Wheel of Fortune entries.

Preserve all unrelated existing card data. Do not replace the character's personality, scenario, relationships, example messages, creator notes, or existing Lorebook entries unless they directly conflict with this task.

============================================================
PART A — CHARACTER BEHAVIOR
============================================================

The extension can be deliberately triggered by the character with these control tokens:

[[SPIN_WHEEL]]
[[SPIN_WHEEL mode=hidden-wheel]]
[[SPIN_WHEEL mode=hidden-result]]
[[SPIN_WHEEL mode=blind]]
[[SPIN_WHEEL level=3]]
[[SPIN_WHEEL mode=blind level=4 seconds=12]]

Add concise persistent instructions to an appropriate character-card field such as system prompt, post-history instructions, character note, personality, or scenario.

Behavior rules:

1. Treat the wheel as an available in-world roleplay mechanic. The character may choose to invoke it when it naturally fits the scene, but it must not dominate normal conversation.

2. Never output a wheel trigger token accidentally, as documentation, as an example to the user, or while merely talking about the wheel. A trigger token must only be emitted when the character genuinely intends to launch a spin.

3. Use [[SPIN_WHEEL]] for a normal spin.

4. Use mode=hidden-wheel when the character wants the user to see the final selected result but not the available wheel choices.

5. Use mode=hidden-result when the character wants the wheel choices visible but the selected result hidden from the user.

6. Use mode=blind when both the wheel choices and the selected result should remain hidden from the user.

7. Use level=N only when intentionally requesting a particular intensity level. Match established roleplay tone, boundaries, pacing, character development, and scenario context. Do not jump to a stronger level without narrative justification.

8. The wheel result is authoritative when the extension injects it back into context. Incorporate it naturally into the roleplay instead of talking about extension internals.

9. If a result is secret, the character may know it but must not directly reveal the selected result, wheel metadata, probabilities, stable IDs, hidden choices, or internal level calculations.

10. Do not repeatedly spin simply because the feature exists. Spins should feel deliberate and meaningful.

============================================================
PART B — CHARACTER LOREBOOK / CHARACTER BOOK
============================================================

If the card format supports an embedded Character Lorebook / Character Book, create or extend it with Wheel of Fortune entries. Wheel v1.3 can read these entries directly when its source is set to "Active character card Lorebook".

If the editing environment cannot modify an embedded Character Lorebook, create a clearly labeled companion Lorebook / World Info plan instead and tell the user that Wheel of Fortune must be set to that Lorebook as its source.

IMPORTANT FORMAT RULE:

Every wheel entry should represent ONE wheel segment.

Put all Wheel metadata in the Lorebook entry Comment / Title field (or compatible key field). Put only the full roleplay instruction in the Content field.

Recommended format:

[WHEEL] [id=unique_stable_id] [weight=3] [min=2] [max=4] [cooldown=2] Visible wheel title

Exact-level one-shot example:

[WHEEL] [id=major_event_01] [weight=1] [level=5] [once] Major turning point

The Content field should contain only the actual instruction, for example:

The selected character must reveal a believable personal secret that fits established characterization and the current scene. Do not contradict known lore.

============================================================
SUPPORTED METADATA
============================================================

[WHEEL]
Required/recommended marker identifying the entry as a wheel segment. Always include it.

[id=unique_stable_id]
Strongly recommended. Give EVERY wheel entry a unique stable ID. Use 1–64 characters consisting only of letters, numbers, underscore, hyphen, period, or colon. Prefer simple lowercase IDs such as:
secret_01
truth_02
challenge_social_03
plot_twist_01

Never reuse an ID for two different wheel entries. The ID must remain unchanged if the visible title is later renamed.

[weight=3]
Relative selection weight. It must be a positive number. Higher values make an entry more likely relative to other eligible entries.

[min=2] [max=4]
The entry is eligible from level 2 through level 4 inclusive.

[level=3]
Shortcut for an entry that exists only at exactly level 3.

[cooldown=2]
After this entry wins, temporarily remove it from the active wheel for the next 2 completed spins, then allow it to return.

[once]
After this entry wins, permanently remove it from the wheel for the CURRENT CHAT. A different/new chat starts with its own one-shot state.

============================================================
PERSISTENCE RULES
============================================================

No [once] and no [cooldown] = the forfeit stays on the wheel and can be selected repeatedly.

[cooldown=N] = the forfeit temporarily leaves the wheel and automatically returns after N completed spins.

[once] = the forfeit permanently disappears for the current SillyTavern chat after selection.

Do NOT combine [once] with [cooldown]. [once] already means permanent removal.

Do NOT combine [level=N] with [min=N] or [max=N]. Use either exact-level syntax OR a level range.

Do NOT define the same metadata property twice on one entry.

============================================================
ADAPTIVE WHEEL DESIGN
============================================================

Unless the user's scenario requires another scale, design for levels 1 through 5:

Level 1 — introductory / light outcomes
Level 2 — more personal or consequential outcomes
Level 3 — stronger scene-changing outcomes
Level 4 — rare or dramatic outcomes
Level 5 — exceptional, major, or one-shot outcomes

The exact nature of these levels must fit the character, scenario, tone, boundaries, and intended roleplay.

Build enough entries that every level remains usable.

For EACH level:
- ensure there are multiple eligible entries;
- include at least 2–3 repeatable entries without [once] or [cooldown];
- add cooldown entries for variety;
- use [once] only for outcomes that genuinely should not repeat;
- do not create a level containing only cooldown or one-shot entries.

A good general distribution is:
- common repeatable events: weight 4–6
- normal events: weight 2–4
- unusual events: weight 1–2
- major one-shot events: weight 1

Do not treat these numbers as mandatory percentages; weights are relative.

============================================================
VALIDATION / FOOLPROOFING RULES
============================================================

Before finishing, check all generated wheel entries:

- every intended wheel entry contains [WHEEL];
- every wheel entry has a unique [id=...];
- IDs contain no spaces or unsupported characters;
- weight is positive;
- min is not greater than max;
- level/min/max are sensible positive integers;
- [level] is not mixed with [min]/[max];
- [once] is not mixed with [cooldown];
- there are valid entries at every intended level;
- every entry has a concise visible title;
- every entry has meaningful Content;
- wheel metadata is not placed in Content;
- existing non-wheel Lorebook entries remain unchanged;
- the final character-card / Character Book structure remains valid SillyTavern card data.

When possible, recommend that the user run the extension's "Validate / preview Lorebook" button or the command:

/wheel-validate

The validator should report zero errors before the wheel pack is considered finished.

============================================================
OUTPUT / EDITING BEHAVIOR
============================================================

If you have direct access to the character-card editor, modify the card and its Character Lorebook directly.

If you are returning JSON, preserve the character-card specification and produce valid JSON. Do not invent incompatible fields when a standard Character Book structure already exists.

If you cannot directly edit the Lorebook, output a structured list containing for each proposed wheel entry:
- Comment / Title
- Content
- intended level range
- weight
- persistence type: repeatable, cooldown, or once

Preserve the character's established personality and writing style throughout.
```

## Compact behavior note for a character card

```text
Wheel of Fortune integration: {{char}} may intentionally launch the external wheel when it naturally fits the roleplay. Use [[SPIN_WHEEL]] for a normal spin; optional controls include mode=hidden-wheel, mode=hidden-result, mode=blind, level=N and seconds=N. Trigger tokens are control commands and must never be quoted or emitted accidentally. When a result is injected back into context, treat it as authoritative and incorporate it naturally. Never reveal hidden results, hidden wheel choices, metadata, probabilities, stable IDs, or internal level calculations.
```

## Minimal Lorebook template

**Comment / Title**

```text
[WHEEL] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret
```

**Content**

```text
The selected character must reveal a believable secret that fits established characterization and the current scene. Do not contradict known lore.
```

For a permanent one-shot event:

```text
[WHEEL] [id=major_event_01] [weight=1] [level=5] [once] Major turning point
```
