# BUCK UP — website handoff

**What it is:** a self-contained browser game (plain HTML/JS, three.js r147). No build step, no framework.

## Run / embed
- Entry file: `index.html`. Host the whole folder as static files (any static host; must keep the folder structure: `assets/`, `scene3d.js`, `game.js`, `models.js`, `ps2textures.js`, `style.css`).
- Easiest embed on a site: upload the folder to e.g. `/buck-up/` and use an iframe:
  `<iframe src="/buck-up/index.html" style="width:100%;height:100vh;border:0" allow="autoplay; fullscreen"></iframe>`
- three.js and its loaders load from `https://unpkg.com/three@0.147.0/...` (needs internet). To self-host, download those files and change the `<script src>` URLs in `index.html` (a local `three-r147` bundle can replace the first group).
- Keyboard game (letters/typing). Desktop browser, GPU recommended. Pixel ratio is capped at 1.75 in `scene3d.js` (`viewSize`) if performance is poor on weak machines.
- Page size is ~120 MB of assets (models are base64 inside `assets/*.js`). Serve with gzip/brotli enabled.

## Do not edit
`game.js` is the game logic. All visuals live in `scene3d.js`; props are in `assets/props_pack.js` (jukebox, deer skull). Audio is currently off until music tracks are supplied.

## Licences (details in `CREDITS.md` / `ATTRIBUTION.txt`)
CC-BY items must stay credited on the site (e.g. a Credits page linking `CREDITS.md`): Renderpeople character models, Black Bull, Jukebox (Rescue3D Assets), White-Tailed Deer Skull (RISD Nature Lab), via Sketchfab. Check the Lucidity Expand font licence before public release. A CC-BY-NC money-stacks model was deliberately NOT used.

## Phone mode (new)
`mobile.js` (loaded after `game.js`) switches on automatically on phones only; desktop keyboard play is unchanged. Landscape: a big arrow + letter shows the next lean, the word fills in at the bottom, and a held lean of the phone is turned into the same key press the keyboard version uses. Each letter has a fixed direction (A/E/I.. left, B/F.. up, C/G.. right, D/H.. down). A one-time "TAP TO ALLOW MOTION" screen and a short calibration (neutral, lean right, lean forward) run first; if motion is unavailable, on-screen arrow buttons are used. iOS needs the page served over HTTPS. Add `?mobile=1` to the URL to force it on for testing.
