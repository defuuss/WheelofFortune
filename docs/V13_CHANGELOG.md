# v1.3.0 hardening changes

- Per-chat `[once]` removals (`removedIdsByChat`) instead of one global removal list.
- Per-chat reset now resets level, spins, cooldowns, and one-shot removals together.
- Stable Lorebook IDs with `[id=...]`.
- Duplicate ID and duplicate identity detection.
- Strict metadata validation; invalid entries are excluded from the active wheel.
- Level coverage preview with repeatable/cooldown/one-shot counts.
- Cooldown deadlock protection.
- Active character card embedded Lorebook / Character Book source.
- Tagged-only import remains the recommended safe mode.
- `/wheel-validate` command.
- Expanded AI integration prompt that teaches card-editing AIs to create valid Character Lorebook wheel entries.
- Modular runtime under `v13/` while retaining the previous root implementation as reference.
