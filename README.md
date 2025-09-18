# Wheel of Forfeits

A standalone web experience for running a configurable wheel of fortune packed with custom forfeits.

## Features

- 🎡 Animated weighted wheel that visually reflects each forfeit's chance of being picked.
- ➕ Slide-in manager to add, edit, or remove forfeits with per-item weights, dependency lists, and removal rules.
- 🔁 Optional automatic removal of forfeits after they've been selected, with the wheel pausing spins until at least one eligible option remains.
- 🔗 Dependency handling so certain forfeits only become available once their prerequisites have been spun.
- 💾 Import/export buttons to save your forfeit setups as JSON and load them back later.
- 🕓 Recent spin history with timestamps and persistence via `localStorage`.

## Getting Started

1. Open `index.html` in a modern browser.
2. Use **Manage Forfeits** to add forfeits. Provide a name, weight (chance), optional dependencies (comma separated names of forfeits that must already have been selected), and whether the entry should be removed after being chosen. Locked entries are shown with a "(locked)" badge until their prerequisites have been spun, and the wheel stays disabled until at least one unlocked option is available.
3. Press **Spin** to animate the wheel and pick a random forfeit according to the weights. The result is announced and stored in the history panel.
4. Export or import your forfeit list at any time to share with others or quickly configure the wheel.

> ℹ️ All data is saved locally in your browser. Clearing site data or switching browsers will reset the wheel unless you export your forfeits first.
