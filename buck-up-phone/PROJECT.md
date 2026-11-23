# BUCK UP: project memory

## KEEP LIST
Never regress these, and restore them from `backups/` if a pass breaks one:
- Animated 3D crowd (rigged Quaternius people, actually moving with retargeted Quaternius Universal Animation Library clips — idle/dance/talk/cheer — plus a packed row at the bar and women dancing on the bar top). No photo cut-outs.
- The old flying-object physics (spin, arcs, miss/hit logic, intensity ramp) — unchanged since `backups/2026-11-16_0025` / `_0050`.
- A touch of warmth and saturation, but a clean SA daylight grade (no mustard wash), with blue sky/windows and readable contrast.
- The clean bar textures (dirty brick, dark wood bar, bottle wall, worn vinyl ring, hide/saddle).
- All songs and keywords in `game.js` (including Chase Dillon, Alba Rari, Hothead, Bitter Blonde, Bottle Blonde, Buckle Belt, Blood Clot).
- Lucidity Expand for the BUCK UP title and the lose-screen title.
- First-person camera with shake. Stay in first person.

## Goal
A first-person mechanical-bull typing/ride web game set in a bar. It must LOOK like GTA San Andreas (PS2 era): gritty, sun-bleached, satirical. All art original or properly licensed, with no Rockstar assets, logos, characters or Pricedown.

## Standing decisions
- Free only: no bills, no paid assets or tools. Nothing published or uploaded. Ask before deleting anything.
- Title "BUCK IT / THE F*CK UP" uses Lucidity Expand (Juani's file, embedded in style.css). Check its licence before any public release.
- Trailer: the mechanical bull only, with no rider.
- No "NOW PLAYING" prefix. Song titles alternate with random letters from level 2. Shuffle bag, so every song shows. Song captions are a radio-station style popup.
- Songs: Buck Up, Shred, Taste, Lick, Gap-Tooth Bitch, Get On Your Face, Post-Concert, Not a Fucking Loser, Chase Dillon, Alba Rari, Hothead, Bitter Blonde, Bottle Blonde, Buckle Belt, Blood Clot. Shown censored, typed in full.
- Flying objects (bottles, bra, belt, boot, lit cigarette): most fly past. The worse you do, the more hit you. Intensity builds gradually. Physics must stay as in the 0025/0050 backups.
- Shake lives in the 3D first-person camera, with no black edges.
- The preferred grade is the older warmer, more saturated pre-0050 look, not the later desaturated pass.
- Room vibe (original art only — do not copy venue logos or names): Coyote Ugly (women dancing on the bar, packed rowdy crowd, bras from the ceiling, neon beer signs, dark wood, rock-bar energy) mixed with Saddle Ranch Chop House on the Sunset Strip (mechanical bull in a padded ring as the centrepiece, western saloon / ranch decor, wagon wheels, antlers, cowhide, lanterns, warm red-amber light, rustic timber beams, a "SUNSET STRIP" neon visible through the doorway).
- Sound deferred.

## Done
- Plain HTML/JS plus three.js r147. Models embedded in models.js so it runs from file://.
- 16 Nov 2026 (backup 2026-11-16_0130, then this pass): restored the warmer palette and the full animated 3D crowd; flying-object code left byte-identical to 0025/0050; bull/camera bucking remapped toward the earlier v2 feel (stronger bob, spin and roll) without changing the intensity ramp, songs, or orange-screen fixes. HUD uses self-hosted Anton (OFL). Coyote Ugly / Saddle Ranch dressing (original only). Credits in CREDITS.md.
- 16 Nov 2026 (backup 2026-11-16_0155, this pass): world-only pass, HUD/physics/songs/Lucidity untouched. Cleaner SA daylight (subtle warmth, FogExp2 0.012, blue window light, no Film/warp, no 5-bit quantize), 640×480 buffer, 256px tiled ambientCG textures, 512 PCF key shadows with a bright fill, dark-hide bull (ivory horns), painted clothing/face textures and 2004-era outfits on the modular crowd, UAL clips retargeted (idle/dance/talk/cheer). Visual targets (box only): Pinterest pins 726909196143883460 and 1139551511991763799. Credits in CREDITS.md.
- 16 Nov 2026 (backup 2026-11-16_0335): restored the opening trailer stills (assets/buckup_trailer_*.jpg) with bottom captions and skip; they play on start, then the title/ride.
- 16 Nov 2026 (backup 2026-11-16_0345): drop-in itch characters (8 animated Quaternius figures: bartender, 2 dancers, 5 crowd) with idle/wave/clap playback in the loader; saloon slot ready for Juani's Sketchfab file (silent fallback); intro skip hint no longer clipped. game.js gameplay / camera / layout frozen.

- 16 Nov 2026 (backup 2026-11-16_0440): tucked in Juani's CC BY Sketchfab models unobtrusively — Farm (low poly) as distant doorway scenery, Cowboy Confidence and GTA sa NPC 1 as still back-room figures (Summer Confidence held back; Mac was offline so the 92 MB source could not be copied). Title-screen credits (C to expand). Also copies the earlier 0345 Quaternius crowd / saloon slot / skip-hint build. game.js gameplay / camera / layout frozen.

- 16 Nov 2026 (backup 2026-11-16_1245): Poly Haven Leather Red 03 on the padded ring and saddle; Quaternius Cyberpunk Signs on the wall-poster spots (generic wording only). Modly characters not shipped — no generation model installed on the Mac. game.js gameplay / camera / layout frozen.

## Roadmap
Each milestone sits on top of the current game, touches only its files, and ends with one screenshot plus a yes/no from Juani.
- Next build (not started): Look target from Juani's mood board (ref/ + Pinterest pin 726909196143883460): SA dusk orange haze, chunky low-poly PS2 characters with painted photo-ish textures (baggy jeans, crop tops, bandanas, gold chains), soft grainy CRT feel, gothic Wasted-style fail text in original wording, Saddle Ranch bull pit (red padded ring, cowhide bull, star lanterns, arched windows). TikTok ref https://www.tiktok.com/@jellybooter/video/7621907155276369174 (GTA x Slayyyter vibe).
- M1 crisp render (done)
- 16 Nov 2026 (backup 2026-11-16_0220): SA palette restyle only — sun-baked tan walls, Grove green accents, orange sunset grade/lighting, 128px nearest textures with mipmaps. Geometry, camera, HUD, mechanics unchanged. M2 Mixamo pending.
- 16 Nov 2026 (backup 2026-11-16_0240): Full PS2 / desert-cowboy-diner reskin (ps2textures.js). Generated 128px nearest textures + grit on every surface, applyPS2Skin, golden-hour lights/fog/sky dome, blob shadows, dpr cap 1.0, warm grade. No gameplay/camera/layout changes. M2 Mixamo still pending.
- 16 Nov 2026 (backup 2026-11-16_0310): Step 2 GitHub-first reskin — mild PS2 vertex snap from lferreira457/threejs-psx-shader (MIT, affine off), sunset light #FF9E44 and FogExp2 #D97A38, dark leather bull (not cherry vinyl), floor-only NearestMipmapNearestFilter to stop checker shimmer, Kenney blob-shadow sprite. game.js / camera / layout / HUD frozen. M2 Mixamo still pending.
- 16 Nov 2026 (backup 2026-11-16_0325): Step 3 — itch.io hot-swap loader (`assets/itchLoader.js` + `assets/itch_incoming/`). Bull hide is a readable dark brown leather under the amber light (the texture is a slightly muted brown so the sun does not turn it cherry-red or almost-black). Checker floor uses larger, lower-contrast tiles (repeat 3×3) plus floor-only mipmaps to cut moire. game.js / camera / layout / HUD frozen. M2 Mixamo still pending.
- 16 Nov 2026 (backup 2026-11-16_1415): Claude, to-do 1 — gothic "Bucked" fail splash (KaTeX_Fraktur Bold, OFL) as a DOM overlay in scene3d.js + style.css, slow fade in/out over the lose screen. game.js / camera / layout / HUD frozen.
- 16 Nov 2026 (backup 2026-11-16_1440): Claude — soft CRT overlay (pure CSS scanlines/grain/vignette, full-res, no dither), generated cowhide on the bull (ps2textures.js `bull_cowhide`), star lanterns and arched tops on the four existing windows (scene3d.js), far-floor trilinear filtering against checker striping. game.js / camera / layout / HUD frozen. Play-tested by Claude at 15:00 (backup 2026-11-16_1500): cowhide UV wrap fix on the bull GLB, darker splash veil.
- 16 Nov 2026 (backup 2026-11-16_1520): Claude — dusk look pass: sun 1.3 / hemi 1.05 (same colours), fog density 0.026, wall base #CDB896. Fixes the lemon-yellow blown-out walls; more orange haze. Play-tested, game.js / camera / layout / HUD frozen.
- 16 Nov 2026 (backup 2026-11-16_1550): Claude — Y2K baddie crowd: random skin tones, hair colours and painted outfits (crop tops, baggy jeans, chunky shoes) from generated atlases (ps2textures.js `outfitTexture`/`skinTexture`), plus hoops, chains, coloured bandanas (scene3d.js tintChar/attachSAAcc). Play-tested, no errors. game.js / camera / layout / HUD frozen.
- 16 Nov 2026 (backup 2026-11-16_1550): Claude — Y2K baddie crowd: random skin tones, hair colours and painted outfits (crop tops, baggy jeans, chunky shoes) from generated atlases (ps2textures.js `outfitTexture`/`skinTexture`), plus hoops, chains, coloured bandanas (scene3d.js tintChar/attachSAAcc). Play-tested, no errors. game.js / camera / layout / HUD frozen.
- M3 Sketchfab props for the Coyote Ugly / Saddle Ranch set
- M4 polish and sound

## How to drop in an itch.io asset
1. Copy the `.glb`, `.gltf` or `.fbx` into `assets/itch_incoming/bar/`, `characters/` or `vehicles/` (this game has no vehicles, so that folder is ignored). Name it after what it replaces, e.g. `bar/counter.glb`, `bar/stool.glb`, `bar/bull.glb`, `characters/bartender.glb`. Extra character files replace the crowd in order.
2. Double-click `assets/itch_incoming/update-itch-manifest.command` (or run it in Terminal). It rewrites `manifest.js` and embeds the models as base64 into `itch_models.js`. That embedding is the reliable path — Chrome often blocks loading raw `.glb` files from a `file://` page.
3. Reload `index.html`. The new mesh keeps the original position, rotation and size; the old mesh stays in the scene but hidden (as a collider). If the manifest is empty or a file fails to load, the current look is left alone.
4. To go back, move the file out of the folder, run the helper again, and reload.

## Claude bridge
Claude Desktop takes tasks from bridge/TO_CLAUDE.md (fail splash, CRT overlay, Saddle Ranch dressing, floor striping) and logs to bridge/FROM_CLAUDE.md. Read FROM_CLAUDE.md before every build and do not duplicate its work. Player Two keeps characters/Modly, the saloon model and the itch loader.
- 2026-11-16: generated exterior (facade, highway, palms, low-riders), live-3D trailer, Bucked pop-ups removed.
- 2026-11-17: real CC BY palms, cars, telephone poles added to the exterior.
- 2026-11-17: FINAL check passed (see bridge/FROM_CLAUDE.md).
- 2026-11-17: Chunkier GTA-style crowd: Kenney CC0 characters (criminal/skater/cyborg, animated idle/run) replace the blocky cops/prisoner/punk in the bar and street. New assets/kenney_chars.js, new script tag in index.html, scene3d.js kActor(). Presentation only; game.js untouched. Backup: backups/2026-11-17_1930.
- 2026-11-17 (later): PS2-style CC0 characters (Wobble Blocks, OpenGameArt) are now the bar crowd, porch dancers, street peds and cops. New assets/ps2_chars.js + script tag in index.html; scene3d.js pActor()/PS2RIG. Fallback chain: PS2 -> Kenney -> old. Presentation only. Backup: backups/2026-11-17_1745.
- 2026-11-17 (later): Kenney Retro Urban Kit (CC0) props added on the strip: parked trucks, shrubs, barriers, lamps, sheds, pallets. New assets/urban_props.js + script tag; scene3d.js loadU(). Presentation only. Backup: backups/2026-11-17_1730.
- 2026-11-17 (later): Sketchfab CC BY animated characters added: BadAssJailer (patrolling thug), psx man, Ceomi dancer (it-girl). New assets/sk_chars.js + script tag; scene3d.js sActor() (falls back to PS2/Kenney characters). Presentation only. Backup: backups/2026-11-17_1755.
- 2026-11-17 (later): street grade added to character textures in ps2textures.js (clothes ~30% less saturated, slightly darker, dirt toward hems; skin slightly muted) to match GTA's grubby crowd. Visual only. Backup: backups/2026-11-17_1810.
- 2026-11-17 (evening): GTA-style street dressing from Sketchfab (CC BY): gangsters (lot + bar crowd), hydraulic Impala lowrider, PS2 parked cars, van, slum house; new assets/gta_street.js + script tag. Bull now bilinear-filtered (no more pixel blob in ride view). Visual only. Backup: backups/2026-11-17_1915.
- 2026-11-17 20:25 (untested edit, backup backups/2026-11-17_2025): #FFAE52 sun, #E89B5A haze, amber-to-twilight sky (scene3d.js, ps2textures.js); cracked/stained asphalt + weathered stucco; bar neon beer signs, bottles, lamp light cones, pool table; newspaper boxes, hydrants, dumpster. All generated; game.js untouched.
- 2026-11-17 22:10 (tested, backup backups/2026-11-17_2210): road now uses ambientCG Asphalt031 (CC0), baked to 128px, SA-graded (ps2textures.js, scene3d.js). Credited.
- 2026-11-22: PBR look foundation per GOFER_UPDATE style lock: HDRI image-based lighting (Cowboy Town Saloon, CC0), ACES tone mapping, Lambert->Standard PBR materials scene-wide, Poly Haven bar stools + barrels. New assets/pbr_pack.js + script tag; one self-contained block in scene3d.js (pbrLook). Remove the script tag to revert. game.js untouched. Backup: backups/2026-11-22_1700.
- 2026-11-22 (18:10): bar room reskinned with Poly Haven CC0 scanned PBR wood (floor, plank walls, counter, ceiling) with normal + roughness maps. ps2textures.js applyPS2Skin now skips meshes flagged userData.keepPBR (one line). Visual only, game.js untouched. Backup: backups/2026-11-22_1810.
- 2026-11-22 (18:25): realistic crowd: the low-poly people inside the bar (crowd, dancers, barPed) are hidden and replaced by up to 22 realistic scanned Renderpeople characters (CC BY), animated. New assets/real_pack.js + script tag; code in scene3d.js pbrLook (realCrowd). Bartender untouched. Visual only. Backup: backups/2026-11-22_1825.
- 2026-11-22 (18:40): realistic swap now covers every character in the world (street, lot, porch, trailer), nearest 40 replaced, moving ones get Nathan's in-place walk and follow their original path. Bartender excluded. Visual only. Backup: backups/2026-11-22_1840.
- 2026-11-22 (18:55): realistic bull body ("Black Bull", CC BY) mounted on the mechanical bull group; old low-poly bull flesh hidden, saddle/post/rider kept. Visual only, ride mechanics untouched. Backup: backups/2026-11-22_1855.
- 2026-11-22 (20:05): baddie bartender (TRELLIS model of Gofer's art) placed behind the bar in place of the old one; crowd mix now women-heavy with baddie colourways (red / black / wine tops recoloured at load). Visual only. Backup: backups/2026-11-22_2005.
- 2026-11-22 (20:20): styled from Juani's reference board: string lights, papel picado bunting and spinning star lanterns over the bar (bloom glow), baddie street tags on the bar's outside walls, magenta-shadow / golden-highlight split-tone in the grade. Visual only. Backup: backups/2026-11-22_2020.
- 2026-11-22 (20:40): bar walls now warm painted plaster with a red plaster band (cantina look from the bull-bar ref), arched palm-sunset windows 1.6x bigger, club light show back (6 sweeping colour beams + spot lights, colour-cycling wash, strobe burst every 4 bars). Visual only. Backup: backups/2026-11-22_2040.
