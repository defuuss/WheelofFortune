# AI prompt: integrate Wheel of Fortune v1.4.1 into a SillyTavern character card

Use the prompt below with an AI that is creating or editing a SillyTavern character card. It teaches the AI how to add **character-triggered wheel behavior**, **automatic post-spin continuation**, **named presets**, and valid **Character Lorebook / Character Book wheel entries**.

```text
You are editing or creating a SillyTavern character card that will be used with the "Wheel of Fortune" extension v1.4.1 or newer.

Your job has THREE parts:

A) Integrate the Wheel of Fortune into the character's persistent roleplay behavior.
B) Build or extend the character's embedded Character Lorebook / Character Book with valid Wheel of Fortune entries.
C) When useful, organize those entries into named wheel presets.

Preserve all unrelated existing card data. Do not replace the character's personality, scenario, relationships, example messages, creator notes, or existing non-wheel Lorebook entries.

============================================================
PART A — CHARACTER BEHAVIOR
============================================================

The character can deliberately launch the extension with control tokens such as:

[[SPIN_WHEEL]]
[[SPIN_WHEEL preset="Secrets"]]
[[SPIN_WHEEL preset="Secrets" mode=hidden-wheel]]
[[SPIN_WHEEL preset="Consequences" mode=hidden-result]]
[[SPIN_WHEEL preset="Dares" mode=blind level=4 seconds=12]]

Available controls:

preset="Name"
mode=full
mode=hidden-wheel
mode=hidden-result
mode=blind
level=N
seconds=N

IMPORTANT TOOL-CALL FLOW:

When the CHARACTER emits a valid wheel trigger, the current character message is considered the request to use the wheel.

The extension then:
1. detects the trigger after that character message finishes;
2. opens and spins the visual wheel;
3. selects exactly one eligible forfeit;
4. injects the selected forfeit privately into model context;
5. automatically requests a NEW character generation;
6. the new character message continues the roleplay using the actual selected result.

Therefore the character must NOT guess, pre-write, simulate, or invent the wheel result in the same message that contains the trigger.

The trigger token should be the LAST meaningful content in the triggering character message. Do not continue roleplay text after the token. The post-wheel continuation will be generated automatically as a fresh character message.

Correct pattern:

Character message:
"Fine. We'll let the wheel decide."
[[SPIN_WHEEL preset="Secrets"]]

--- wheel spins and selects a result ---

Automatic next character message:
The character reacts to and carries out the ACTUAL selected result.

Incorrect pattern:

"Fine. We'll let the wheel decide."
[[SPIN_WHEEL preset="Secrets"]]
"It landed on Reveal a secret, so here is my secret..."

The character cannot know what the wheel selected until the extension returns the result.

Behavior rules:

1. Treat the wheel as an available in-world roleplay mechanic. The character may choose to invoke it when it naturally fits the scene, but it must not dominate normal conversation.

2. Never output a wheel trigger token accidentally, as documentation, as an example to the user, or while merely talking about the wheel. Emit a token only when the character genuinely intends to spin.

3. When intentionally invoking the wheel, place the trigger token at the end of the character's message and stop. Wait for the extension-driven continuation rather than writing what happens next in the same message.

4. Never predict, choose, fake, or narrate the result before the actual wheel result is injected by the extension.

5. Use [[SPIN_WHEEL]] for the currently active/default preset.

6. Use preset="Name" only when that preset actually exists. Never invent a preset name during roleplay.

7. Use mode=hidden-wheel when the character wants the user to see the final result but not the available wheel choices.

8. Use mode=hidden-result when the choices may be visible but the selected result must remain secret from the user.

9. Use mode=blind when both choices and selected result must remain secret.

10. Use level=N only when deliberately requesting a specific intensity. Match established tone, pacing, boundaries, character development, and scenario context. Do not jump arbitrarily to a stronger level.

11. When the extension injects a wheel result into the automatically generated follow-up, treat it as authoritative and continue the roleplay naturally from that result.

12. If a result is secret, the character may know it but must not directly reveal the selected result, hidden choices, weights, stable IDs, preset-routing metadata, or internal level calculations. Instead, act on the secret result naturally.

13. Do not immediately trigger another wheel from the automatic follow-up unless the scene genuinely requires a separate later spin. One deliberate trigger should normally produce one wheel result and one continuation.

14. Do not repeatedly spin just because the feature exists. Spins should feel deliberate and meaningful.

Add concise persistent instructions to an appropriate card field such as system prompt, post-history instructions, personality, character note, or scenario.

============================================================
PART B — CHARACTER LOREBOOK / CHARACTER BOOK
============================================================

If the card supports an embedded Character Lorebook / Character Book, create or extend it with Wheel of Fortune entries. The extension can read the embedded Character Book directly when its source is set to "Active character card Lorebook".

Every wheel entry represents ONE wheel segment.

Put ALL wheel metadata in the Lorebook entry Comment / Title field or compatible key field.
Put ONLY the actual roleplay instruction in Content.

Recommended basic entry:

[WHEEL] [id=truth_01] [weight=4] [min=1] [max=3] Truth question

Content:
Ask or answer a believable personal truth question that fits the established character and current scene.

Cooldown example:

[WHEEL] [id=secret_01] [weight=2] [min=2] [max=5] [cooldown=2] Reveal a secret

One-shot example:

[WHEEL] [id=plot_01] [weight=1] [level=5] [once] Major turning point

The Content instruction should be written so the character can continue directly from it in the automatic post-spin generation. Do not write Content that asks the model to choose another wheel result or to output another trigger token.

============================================================
PART C — NAMED PRESETS
============================================================

Wheel v1.4 supports multiple named wheel presets such as:

General
Truths
Dares
Secrets
Consequences
Chaos
Story Events

Do not create presets unnecessarily. Use them when different categories should have distinct wheels or different behavior.

Lorebook routing uses:

[preset=Secrets]

Example:

[WHEEL] [preset=Secrets] [id=secret_01] [weight=3] [min=2] [max=5] Reveal a secret

An entry WITHOUT [preset=...] is shared by every named preset that uses the same Lorebook source.

A single entry may target multiple presets using a comma-separated value:

[WHEEL] [preset=Secrets,Truths] [id=confession_01] [weight=2] Confession

Use preset names exactly and consistently. Do not accidentally create near-duplicates such as "Secret", "Secrets", and "The Secrets Wheel" unless they are intentionally different presets.

When designing the character, provide a recommended preset list to the user. The extension's preset manager is used to create those named presets in SillyTavern.

============================================================
SUPPORTED METADATA
============================================================

[WHEEL]
Always include this marker for wheel entries.

[id=unique_stable_id]
Strongly recommended for every entry. Use 1–64 characters containing letters, numbers, underscore, hyphen, period, or colon. Keep the ID unchanged even if the visible title is renamed.

[preset=Name]
Optional. Routes this entry to a named preset. No preset tag means the entry is shared. Multiple presets may be comma-separated.

[weight=3]
Relative probability weight. Must be a positive number.

[min=2] [max=4]
Eligible from level 2 through level 4 inclusive.

[level=3]
Eligible only at exactly level 3.

[cooldown=2]
After winning, the entry temporarily leaves the wheel for the next 2 completed spins of that preset in that chat, then returns.

[once]
After winning, the entry permanently disappears for that preset in the CURRENT CHAT. Other chats and other presets maintain separate state.

============================================================
PERSISTENCE AND PRESET STATE
============================================================

No [once] and no [cooldown] = repeatable and remains on the wheel.

[cooldown=N] = temporarily removed, then returns.

[once] = permanently removed for the current preset + current chat.

Each named preset has its own adaptive level, completed-spin count, cooldowns, and one-shot removals per SillyTavern chat.

Do NOT combine [once] with [cooldown].
Do NOT combine [level=N] with [min=N]/[max=N].
Do NOT define the same metadata property twice on one entry.

============================================================
ADAPTIVE WHEEL DESIGN
============================================================

Unless another scale is requested, use levels 1–5:

Level 1 — introductory / light outcomes
Level 2 — more personal or consequential outcomes
Level 3 — stronger scene-changing outcomes
Level 4 — rare or dramatic outcomes
Level 5 — exceptional / major / one-shot outcomes

For every intended level of every preset:
- provide multiple eligible entries;
- include at least 2–3 repeatable entries without cooldown/once;
- add cooldown entries for variety;
- use [once] only for genuinely non-repeatable outcomes;
- avoid a wheel made entirely from cooldown or once entries.

Typical relative weights:
common repeatable = 4–6
normal = 2–4
unusual = 1–2
major one-shot = 1

============================================================
VALIDATION RULES
============================================================

Before finishing, check:

- every intended wheel entry has [WHEEL];
- every entry has a unique stable [id=...];
- IDs contain no spaces or unsupported characters;
- every [preset=...] name is intentional and consistent;
- weight is positive;
- min is not greater than max;
- level/min/max are valid positive integers;
- [level] is not mixed with [min]/[max];
- [once] is not mixed with [cooldown];
- each intended preset has usable entries at every intended level;
- shared entries intentionally omit [preset=...];
- every entry has a concise visible title and meaningful Content;
- metadata is not placed in Content;
- Lorebook Content is directly actionable in the automatic follow-up generation;
- existing non-wheel Lorebook entries remain unchanged.

Recommend running:

/wheel-validate

for each preset, and consider:

/wheel-presets
/wheel-preset preset="Secrets"
/wheel preset="Secrets"

The validator should report zero errors before the wheel pack is considered finished.

============================================================
OUTPUT / EDITING BEHAVIOR
============================================================

If you can directly edit the character card, modify it and its Character Lorebook directly.

If you return JSON, preserve the SillyTavern character-card specification and produce valid JSON.

If you cannot edit the Lorebook directly, output a structured wheel plan containing for every proposed entry:
- preset or SHARED
- Comment / Title
- Content
- stable ID
- level/range
- weight
- persistence type: repeatable, cooldown, or once

Also output the exact list of named presets the user should create in Wheel of Fortune v1.4.1.
```

## Compact card behavior note

```text
Wheel of Fortune v1.4.1 integration: {{char}} may intentionally launch the external wheel when it naturally fits the roleplay. Use [[SPIN_WHEEL]] for the active wheel or [[SPIN_WHEEL preset="Exact Preset Name"]] for a named preset. Optional controls include mode=hidden-wheel, mode=hidden-result, mode=blind, level=N and seconds=N. A trigger is a tool-call boundary: when {{char}} intentionally triggers the wheel, put the trigger token at the END of the message and stop. Do not guess or narrate the result. The extension will spin, inject the actual selected forfeit, and automatically request a NEW {{char}} message that continues from the result. Trigger tokens must never be quoted or emitted accidentally. Only use preset names that actually exist. Treat injected results as authoritative. Never reveal hidden results, hidden choices, metadata, probabilities, stable IDs, preset routing, or internal level calculations.
```

## Minimal preset-routed Lorebook template

**Comment / Title**

```text
[WHEEL] [preset=Secrets] [id=secret_01] [weight=3] [min=2] [max=4] [cooldown=2] Reveal a secret
```

**Content**

```text
Reveal a believable secret that fits established characterization and the current scene. Do not contradict known lore. Continue the roleplay naturally from this result.
```

Shared entry usable by every preset using the Lorebook:

```text
[WHEEL] [id=lucky_escape_01] [weight=1] Lucky escape
```
