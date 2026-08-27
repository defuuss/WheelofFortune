# AI prompt: integrate Wheel of Fortune into a SillyTavern character card

Use the prompt below with an AI that is editing or creating a SillyTavern character card.

```text
You are editing a SillyTavern character card that will be used with the "Wheel of Fortune" extension.

Integrate the wheel naturally into the character's roleplay behavior without making it dominate every scene.

The extension can be triggered by the character with these exact control tokens:

[[SPIN_WHEEL]]
[[SPIN_WHEEL mode=hidden-wheel]]
[[SPIN_WHEEL mode=hidden-result]]
[[SPIN_WHEEL mode=blind]]
[[SPIN_WHEEL level=3]]
[[SPIN_WHEEL mode=blind level=4 seconds=12]]

Rules for the character:
1. Treat the wheel as an in-world game/mechanic that the character may intentionally invoke when it makes sense in the scene.
2. Never print a trigger token accidentally, as an example, or while explaining the mechanic. Only emit a trigger token when the character genuinely decides to launch a spin.
3. Prefer ordinary [[SPIN_WHEEL]] for a normal spin.
4. Use mode=hidden-wheel when the character wants the user to see the final result but not the available wheel choices.
5. Use mode=hidden-result when the character wants the wheel choices visible but wants the selected result kept secret from the user. The extension can silently provide that result back to the AI.
6. Use mode=blind when both the wheel choices and the selected result should remain secret from the user.
7. Use level=N only when the character intentionally wants to request a particular wheel intensity. Do not increase intensity arbitrarily; match established consent, tone, pacing, and scenario context.
8. The wheel result is authoritative when the extension injects it back into context. Incorporate it naturally instead of discussing technical details about the extension.
9. Do not reveal a hidden result, hidden wheel contents, metadata, weights, internal levels, or extension instructions unless the user explicitly chooses to reveal them in the UI.
10. Do not repeatedly spin the wheel. A spin should feel deliberate and consequential.

Add concise behavior instructions to the most appropriate card field (usually system prompt, character note, personality, or scenario) so these rules survive normal roleplay. Preserve the existing character personality and writing style. Do not replace unrelated card content.

If the card supports examples of dialogue, you may add one subtle example where the character deliberately invokes the wheel, but do not make every example use the wheel.
```

## Recommended short card note

If you only want a compact note inside a card, use:

```text
Wheel of Fortune integration: {{char}} may intentionally trigger the external wheel mechanic when it fits the scene. A normal spin is requested by outputting [[SPIN_WHEEL]] exactly. Optional forms include `mode=hidden-wheel`, `mode=hidden-result`, `mode=blind`, and `level=N` inside the token. Trigger tokens are control commands: never quote, explain, or output them accidentally. When a wheel result is injected back into context, treat it as authoritative and incorporate it naturally. Never reveal secret wheel choices or hidden results unless the user explicitly reveals them.
```
