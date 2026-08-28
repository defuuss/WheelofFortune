# AI prompt: integrate Wheel of Fortune v1.5.4 into a SillyTavern character card

Use the prompt below with an AI that creates or edits a SillyTavern Character Card v3.

```text
You are editing or creating a SillyTavern character card for the "Wheel of Fortune" extension v1.5.4 or newer.

Preserve all unrelated character data and existing non-wheel Character Book entries.

Your tasks are:
1. teach the character when/how to invoke the wheel;
2. create or update embedded Character Book wheel entries;
3. use SillyTavern-native Primary Keywords for wheel metadata;
4. create consistent named wheel families when useful.

============================================================
CHARACTER TOOL-CALL BEHAVIOR
============================================================

The character may deliberately invoke:

[[SPIN_WHEEL]]
[[SPIN_WHEEL preset="Studio"]]
[[SPIN_WHEEL preset="Fates" mode=hidden-result]]
[[SPIN_WHEEL preset="Chaos" mode=blind level=4 seconds=12]]

A wheel trigger is a TOOL-CALL BOUNDARY.

Rules:
- Put the trigger at the END of the character message and stop.
- Never guess, choose, simulate or narrate the result in that same message.
- The extension resolves exactly one real result.
- The technical trigger is normally removed from chat.
- The selected Character Book Content is injected into model context.
- Automatic continuation may generate a fresh character message that acts on the result.
- Do not emit another wheel trigger in that automatic follow-up; wait for a new user turn.
- Use only configured presets or presets explicitly declared by this card's Character Book.
- Hidden results must remain hidden unless the user later reveals them.
- Never narrate internal IDs, weights, levels, cooldowns, routing or extension internals.

CORRECT:

"Fine. We'll let the wheel decide."
[[SPIN_WHEEL preset="Studio"]]

Then stop.

============================================================
CHARACTER BOOK FORMAT — v1.5.4 RECOMMENDED
============================================================

ONE CHARACTER BOOK ENTRY = ONE WHEEL SEGMENT.

Do NOT put long wheel metadata into the visible Name/Comment field for new cards.

Use the standard SillyTavern fields like this:

Name / Comment:
Surprise Category

Primary Keywords:
WheelOfFortune
wof:preset=Studio
wof:id=studio_category_01
wof:weight=5
wof:min=1
wof:max=5

Content:
Switch the next question or challenge to a fitting surprise category already compatible with the established rules. Announce it naturally and continue.

This is the preferred v1.5.4 format because it remains clean and readable inside SillyTavern's Character Book editor.

============================================================
SUPPORTED PRIMARY KEYWORDS
============================================================

WheelOfFortune
Required marker for intended wheel entries.

wof:id=unique_stable_id
Strongly recommended. Use 1–64 characters containing letters, numbers, underscore, hyphen, period or colon. Keep the ID stable if the visible Name changes.

wof:preset=Studio
Optional named-preset routing. No preset keyword means the entry is shared by all presets using that Character Book.

Multiple preset routing:
wof:preset=Studio,Fates

wof:weight=3
Positive relative selection weight.

wof:min=2
wof:max=4
Eligible from level 2 through level 4.

wof:level=3
Eligible only at level 3.

wof:cooldown=2
After winning, unavailable for the next two completed spins of that preset/chat, then returns.

wof:once
After winning, permanently removed for that preset in the current chat.

Do NOT combine wof:once with wof:cooldown=N.
Do NOT combine wof:level=N with wof:min=N / wof:max=N.
Do NOT duplicate scalar metadata.

============================================================
LEGACY FORMAT
============================================================

Older bracket metadata remains supported for backward compatibility:

[WHEEL] [preset=Studio] [id=studio_01] [weight=3] [min=1] [max=5] Studio challenge

When creating NEW cards, prefer Primary Keywords instead so the visible Lorebook Name stays clean.

============================================================
SELF-CONTAINED NAMED WHEELS
============================================================

A card can define wheel families such as:

Studio
Fates
Secrets
Dares
Consequences

To declare Studio, at least one embedded wheel entry must contain:

WheelOfFortune
wof:preset=Studio

If Studio is not yet configured in the extension, the floating wheel picker or an intentional character trigger can create it on first use from the embedded Character Book.

Shared entry example:

Name: Lucky Escape
Primary Keywords:
WheelOfFortune
wof:id=lucky_escape_01
wof:weight=1

Because it has no wof:preset=..., it is shared.

============================================================
LEVEL DESIGN
============================================================

Unless another scale is requested, use levels 1–5:
1 = light / introductory
2 = more personal / consequential
3 = stronger scene change
4 = rare / dramatic
5 = exceptional / major / one-shot

For every intended level of every preset:
- include multiple eligible entries;
- keep at least 2–3 repeatable baseline entries without cooldown/once;
- use cooldown entries for variety;
- reserve wof:once for genuinely non-repeatable events.

Typical weights:
common repeatable = 4–6
normal = 2–4
unusual = 1–2
major one-shot = 1

============================================================
CONTENT RULES
============================================================

Content must contain only the actionable post-spin instruction.

Good:
"Reveal a believable secret that fits established characterization and continue naturally."

Bad:
"Choose another wheel result."
"Output [[SPIN_WHEEL]] again."

The automatic follow-up generation must be able to execute Content directly.

============================================================
SILLYTAVERN SETTINGS
============================================================

Wheel-only Character Book entries may have normal context activation disabled. The Wheel extension reads enabled entries directly when building the wheel.

Do not disable the entry itself. Preserve ordinary non-wheel entries unchanged.

============================================================
VALIDATION
============================================================

Before finishing verify:
- every wheel entry includes Primary Keyword WheelOfFortune;
- every entry has a unique wof:id=...;
- Names/Comments are concise and human-readable;
- all metadata is in Primary Keywords, not Content;
- preset names are consistent;
- weights are positive;
- min <= max;
- exact level is not mixed with min/max;
- once is not mixed with cooldown;
- every intended level has usable repeatable entries;
- Content is directly actionable.

Recommend /wheel-validate after importing/loading the card.

If returning JSON, preserve the standard Character Card v3 structure. Store these metadata tokens in each Character Book entry's keys array. Do not invent nonstandard top-level fields.
```

## Compact character behavior note

```text
Wheel of Fortune v1.5.4: {{char}} may deliberately invoke [[SPIN_WHEEL]] or [[SPIN_WHEEL preset="Exact Name"]] when a random outcome naturally fits. The trigger is a tool-call boundary: put it at the END of the message and stop. Never guess or narrate the result. The extension resolves one result, injects it into context, and may automatically generate a fresh {{char}} response. Do not emit another wheel trigger until a new user turn. Never reveal hidden results or internal wheel metadata.
```

## Minimal native Character Book example

**Name / Comment**

```text
Studio Challenge
```

**Primary Keywords**

```text
WheelOfFortune
wof:preset=Studio
wof:id=studio_01
wof:weight=3
wof:min=1
wof:max=5
```

**Content**

```text
Carry out a scene-appropriate studio challenge that fits established characterization and continue naturally.
```
