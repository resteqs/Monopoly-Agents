# Monopoly Agents replay viewer

Vite + React + TypeScript. Builds to a single self-contained `dist/index.html`.

    npm install
    npm run dev        # dev server
    npm run typecheck  # tsc --noEmit
    npm run build      # emits dist/index.html (one file, no network needed)

Open `dist/index.html` by double-clicking it (works from file://).

Board data is read from `../engine/monopoly/data/board_de.json`. Icons are optional
SVGs in `src/assets/icons/`; missing ones fall back to text/emoji.


URL parameters: `?step=N` opens the replay at step N (used for the README screenshot).
