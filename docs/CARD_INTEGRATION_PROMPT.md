# AI prompt: integrate Wheel of Fortune v1.5 into a SillyTavern character card

Use the prompt below with an AI that is creating or editing a SillyTavern character card. It covers the **character tool-call behavior**, **automatic continuation**, **anti-loop rule**, **named presets**, and **Character Lorebook / Character Book entries**.

```text
You are editing or creating a SillyTavern character card that will be used with the "Wheel of Fortune" extension v1.5 or newer.

Your job has THREE parts:

A) Integrate the Wheel of Fortune into the character's persistent behavior.
B) Build or extend the embedded Character Lorebook / Character Book with valid wheel entries.
C) Organize entries into named presets when that improves the scenario.

Preserve all unrelated character-card data. Do not replace existing personality, scenario, relationships, example messages, creator notes, or non-wheel Lorebook entries.

============================================================
A — CHARACTER TOOL-CALL BEHAVIOR
============================================================

The character may deliberately invoke the external visual wheel with commands such as:

[[SPIN_WHEEL]]
[[SPIN_WHEEL preset="Secrets"]]
[[SPIN_WHEEL preset="Secrets" mode=hidden-wheel]]
[[SPIN_WHEEL preset="Consequences" mode=hidden-result]]
[[SPIN_WHEEL preset="Chaos" mode=blind level=4 seconds=12]]

Available controls:

preset="Exact Preset Name"
mode=full
mode=hidden-wheel
mode=hidden-result
mode=blind
level=N
seconds=N

IMPORTANT: THE TRIGGER IS A TOOL-CALL BOUNDARY.

When the CHARACTER intentionally emits a valid wheel trigger:

1. the trigger should be the LAST meaningful content in that character message;
2. the extension detects it after the message finishes;
3. v1.5 normally removes the technical trigger token from the stored/rendered chat message;
4. the wheel opens and resolves exactly ONE result;
5. the real selected forfeit is injected into model context;
6. when automatic continuation is enabled, SillyTavern generates a NEW character message;
7. that fresh message reacts to and carries out the actual selected result.

The character must NEVER guess, simulate, choose, or narrate the result in the same message as the trigger.

CORRECT:

"Fine. We'll let the wheel decide."
[[SPIN_WHEEL preset="Secrets"]]

Then stop. The extension will resolve the wheel and create the next character response.

INCORRECT:

"Fine. We'll let the wheel decide."
[[SPIN_WHEEL preset="Secrets"]]
"It landed on Reveal a secret, so..."

The character cannot know the real result before the extension returns it.

Behavior rules:

- Use the wheel only when it naturally fits the roleplay.
- Never print a trigger merely as documentation or an example to the user.
- Use [[SPIN_WHEEL]] for the currently active preset.
- Use preset="Name" only for a preset that actually exists.
- hidden-wheel = available choices hidden, final result visible.
- hidden-result = choices may be visible, final result hidden from the user.
- blind = both choices and final result hidden from the user.
- Match level=N to established pacing, tone, boundaries, character development and scenario context.
- Treat the injected wheel result as authoritative.
- If a result is secret, act on it naturally without explicitly revealing it.
- Never narrate internal IDs, weights, probabilities, preset routing, cooldowns, validator data or level calculations.
- Do not output another wheel trigger in the automatic post-spin follow-up. Wheel v1.5 has a hard anti-loop guard and requires a new USER turn before another automatic character-triggered spin.
- One deliberate invocation should normally mean one wheel result.

Add a concise version of these rules to an appropriate persistent character-card field such as post-history instructions, system prompt, personality, character note, or scenario.

============================================================
B — CHARACTER LOREBOOK / CHARACTER BOOK
============================================================

If the card format supports an embedded Character Lorebook / Character Book, create or extend it with Wheel of Fortune entries.

The extension can read these entries directly when Source is set to:

Active character card Lorebook

Use tagged-only import mode so normal Lorebook entries are not turned into wheel segments.

ONE LOREBOOK ENTRY = ONE WHEEL SEGMENT.

Put all wheel metadata in the entry Comment / Title field (or compatible key field).
Put only the actionable roleplay instruction in Content.

Example Comment / Title:

[WHEEL] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret

Example Content:

Reveal a believable personal secret that fits established characterization and the current scene. Do not contradict known lore. Continue the roleplay naturally from this result.

The Content must be directly actionable by the automatic post-spin generation. Do NOT tell the model to choose another result or output another wheel trigger.

============================================================
SUPPORTED METADATA
============================================================

[WHEEL]
Always include this marker for intended wheel entries.

[id=unique_stable_id]
Strongly recommended on every wheel entry.
Use 1–64 characters containing letters, numbers, underscore, hyphen, period, or colon.
Keep the same ID if the visible title is renamed.
Never reuse the same ID for two different entries.

[preset=Secrets]
Optional named-preset routing.
No preset tag means the entry is shared by every preset using that Lorebook.
Multiple presets may be comma-separated:

[preset=Secrets,Truths]

[weight=3]
Positive relative selection weight.

[min=2] [max=4]
Eligible from level 2 through level 4 inclusive.

[level=3]
Eligible only at exactly level 3.

[cooldown=2]
After winning, temporarily unavailable for the next 2 completed spins of that preset in that chat, then returns.

[once]
After winning, permanently removed for that preset in the CURRENT CHAT.
Other chats and presets have independent state.

Do NOT combine [once] with [cooldown].
Do NOT combine [level=N] with [min=N]/[max=N].
Do NOT define the same scalar metadata property twice.

============================================================
C — NAMED PRESETS
============================================================

Use named presets when the scenario benefits from distinct wheel categories, for example:

General
Truths
Dares
Secrets
Consequences
Chaos
Story Events

Example preset-routed entry:

[WHEEL] [preset=Secrets] [id=secret_02] [weight=2] [min=2] [max=5] Confession

Shared entry:

[WHEEL] [id=lucky_escape_01] [weight=1] Lucky escape

The shared entry has no [preset=...] tag.

Use preset names consistently. Do not accidentally create near-duplicates such as Secret / Secrets / The Secrets Wheel unless they are intentionally separate.

When proposing a card, output the exact preset names the user should create in the extension.

============================================================
ADAPTIVE LEVEL DESIGN
============================================================

Unless another scale is requested, use levels 1–5:

Level 1 — introductory / light outcomes
Level 2 — more personal or consequential outcomes
Level 3 — stronger scene-changing outcomes
Level 4 — rare or dramatic outcomes
Level 5 — exceptional / major / one-shot outcomes

For every intended level of every preset:

- include multiple eligible entries;
- include at least 2–3 repeatable baseline entries without cooldown/once;
- add cooldown entries for variety;
- reserve [once] for genuinely non-repeatable events;
- do not make a level consist only of cooldown and one-shot entries.

Typical relative weights:

common repeatable = 4–6
normal = 2–4
unusual = 1–2
major one-shot = 1

============================================================
VALIDATION CHECKLIST
============================================================

Before finishing, verify:

- every intended wheel entry has [WHEEL];
- every wheel entry has a unique stable [id=...];
- IDs have no spaces or unsupported characters;
- every [preset=...] name is intentional and consistent;
- weights are positive;
- min is not greater than max;
- level/min/max values are sensible positive integers;
- [level] is not mixed with [min]/[max];
- [once] is not mixed with [cooldown];
- each preset has usable entries at every intended level;
- shared entries intentionally omit [preset=...];
- each entry has a concise visible title;
- each entry has meaningful, directly actionable Content;
- wheel metadata is not placed in Content;
- existing non-wheel Lorebook entries remain unchanged.

Recommend running /wheel-validate for every preset before considering the pack finished.

Useful commands:

/wheel-presets
/wheel-preset preset="Secrets"
/wheel-validate
/wheel preset="Secrets"

============================================================
OUTPUT / EDITING BEHAVIOR
============================================================

If you can directly edit the character card, modify the card and embedded Character Lorebook directly.

If returning JSON, preserve the SillyTavern character-card specification and produce valid JSON. Do not invent incompatible fields when a standard Character Book structure exists.

If you cannot directly edit the Lorebook, output a structured wheel plan containing, for every proposed entry:

- preset or SHARED
- Comment / Title
- Content
- stable ID
- level or level range
- weight
- persistence type: repeatable, cooldown, or once

Also output the exact list of named presets to create.
```

## Compact character-card behavior note

```text
Wheel of Fortune v1.5: {{char}} may deliberately invoke the external wheel when it naturally fits the roleplay. Use [[SPIN_WHEEL]] for the active preset or [[SPIN_WHEEL preset="Exact Preset Name"]] for a named preset; optional controls include mode=hidden-wheel, mode=hidden-result, mode=blind, level=N and seconds=N. A trigger is a tool-call boundary: place it at the END of the message and stop. Never guess or narrate the result. The extension resolves one real result, normally removes the technical trigger from chat, injects the result into context, and can automatically generate a fresh {{char}} message that acts on it. Do not emit another wheel trigger in that automatic follow-up; wait for a new user turn. Never reveal hidden results or internal wheel metadata.
```

## Minimal Lorebook template

**Comment / Title**

```text
[WHEEL] [preset=Secrets] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret
```

**Content**

```text
Reveal a believable secret that fits established characterization and the current scene. Do not contradict known lore. Continue naturally from this result.
```
