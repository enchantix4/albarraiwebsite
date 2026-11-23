# BUCK UP — brief for Claude (visuals only)

**Goal:** reskin BUCK UP, a first-person mechanical-bull typing game (plain HTML/JS + three.js r147, runs from `index.html` via file://), so it reads as a 2004 PS2 GTA San Andreas-style game set in a rowdy roadside dive bar (Coyote Ugly / Saddle Ranch Chop House). Not suburbia, no fisheye.

## Frozen (see `.cursorrules`)
- No changes to gameplay, physics, input, collisions, game state, HUD, camera position/FOV or layout.
- `game.js` is gameplay: don't touch it. Never touch `game_v2_backup.js`.
- Visual-only files: `scene3d.js`, `ps2textures.js`, `models.js`, `style.css`, `assets/itchLoader.js`, `assets/cc_models.js`.
- No ES modules (they break on file://). Models are embedded as base64 JS.

## Keep (never regress)
Animated 3D crowd, flying-object physics, warm palette, clean bar, all songs/keywords, Lucidity Expand titles, first-person in-world shake (no black edges), SA-style HUD, riderless trailer bull, no "NOW PLAYING" prefix. Rejected looks: photo billboards, desaturated mustard grade, 640x480 + dither.

## Look rules
128/256px textures, NearestFilter, Lambert/Basic (no PBR). Sunset directional light #FF9E44, FogExp2 #D97A38.
Refs: `ref/` folder, plus https://uk.pinterest.com/pin/726909196143883460/, https://uk.pinterest.com/pin/1139551511991763799/ and https://www.tiktok.com/@jellybooter/video/7621907155276369174 (GTA x Slayyyter vibe).

## Adding models
Drop a .glb/.fbx in `assets/itch_incoming/bar/` or `characters/` (named by slot, e.g. `bar/counter.glb`, `characters/bartender.glb`), run `assets/itch_incoming/update-itch-manifest.command`, then reload. Full steps are in PROJECT.md.

## Rules
- Free, licence-clean assets only (CC0 / CC BY / MIT). No Rockstar assets, logos, characters or the Pricedown font. No real-celebrity likenesses.
- Credit every asset in `CREDITS.md`.
- Back up the files you touch to `backups/<date_time>/` before editing. Never delete anything without asking Juani.
- Nothing gets uploaded or published.
- Add one line to `PROJECT.md` after each change.

## Still to do
1. Mood-board look pass: dusk orange haze, chunky low-poly characters with painted textures (baggy jeans, crop tops, bandanas, gold chains), soft grainy CRT feel, gothic "Wasted"-style fail splash in original wording, Saddle Ranch pit (cowhide bull, star lanterns, arched windows).
2. Original characters from refs via Modly (local API at http://127.0.0.1:8765; first download a generation model in the Modly app), rigged/animated so none stand still.
3. Saloon interior: Juani's Sketchfab "Western Saloon Interior" goes in as `assets/itch_incoming/bar/saloon.glb`.
4. Checker floor still stripes a bit in the distance.
5. M4: polish and sound.

## Standing rules (added 2026-11-17)
- Do not ask Juani questions or permission unless completely and absolutely necessary. Decide, act, report briefly.
- Everything found, downloaded or used must be free (CC0 / CC-BY / MIT or similar) with no fees or additional costs. Never use paid models. If unsure of a licence or price, skip it.
- Credit every asset in CREDITS.md and ATTRIBUTION.txt.
- When asked to remove downloads, move them to the Bin; never delete anything otherwise.
