# v1.3 runtime

This directory contains the active Wheel of Fortune v1.3 SillyTavern runtime.

- `state.js` — settings, per-chat level/cooldown/one-shot state, character trigger hint
- `lorebook.js` — standalone and Character Lorebook parsing, stable IDs, validation, eligibility and cooldown-deadlock protection
- `wheel.js` — animated wheel, secrecy modes, suspense and result delivery
- `settings.js` — extension settings and validation UI
- `index.js` — slash commands, text triggers and initialization
- `style.css` — imports the shared visual wheel CSS and adds validator styles

The root `index.js` is retained as the previous implementation/reference. `manifest.json` points to `v13/index.js`.
