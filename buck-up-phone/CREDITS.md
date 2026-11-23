# BUCK UP credits

## Code and fonts
- three.js r147 (MIT licence) — 3D rendering, GLTFLoader and post-processing, loaded from unpkg.com
- Lucidity Expand, font file supplied by Juani; check its licence before any public release. Used for the BUCK UP title and the lose-screen title (BUCK IT / THE F*CK UP). Embedded as a base64 @font-face in style.css so the game can run from a local file:// page.
- Anton (SIL Open Font License 1.1) — https://github.com/google/fonts/tree/main/ofl/anton — The Anton Project Authors (https://github.com/googlefonts/AntonFont.git). Self-hosted in assets/fonts (Anton-Regular.ttf, Anton-OFL.txt) and embedded as a base64 @font-face in style.css. Used for the in-game HUD and minigame splashes, all caps, hard outlines. Not Pricedown, not a Rockstar font.

## 3D models (all CC0 / public domain, free for any use)
- Quaternius, Ultimate Modular Men Pack (CC0) — https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ — also https://quaternius.com/packs/ultimatemodularcharacters.html
- Quaternius, Ultimate Modular Women Pack (CC0) — https://poly.pizza/bundle/Ultimate-Modular-Women-Pack-aCBDXDdTNN — also https://quaternius.com/packs/ultimatemodularwomen.html
- Quaternius, Bull (CC0) — https://poly.pizza/m/a8PIIYwF7r — also https://quaternius.com ; the animal mesh is posed (legs tucked) and mounted on the original chrome hydraulic post, saddle and pit so it reads as a mechanical rodeo bull, not livestock on a table.
- Quaternius, Bottles (CC0) — https://poly.pizza/m/UpU7H3QbAR
- Quaternius, Counter Straight / Counter Corner / Counter Doors (CC0) — https://poly.pizza/m/uwfs2Gbd5I , https://poly.pizza/m/7GzmqI1M0fC , https://poly.pizza/m/CBUx8ZMVAO — saloon bar counters
- Kenney, Furniture Kit (CC0) — https://kenney.nl/assets/furniture-kit — stools, televisions, sofas, lamps, bookcases, speakers, coat rack, radio, plant, kitchen bar
- mastjie, Cowboy (CC0) — https://poly.pizza/m/S8hq7LEXTT — still embedded in models.js; no longer placed in the scene
- mastjie, Cowgirl (CC0) — https://poly.pizza/m/bB93W7ZTmG — still embedded in models.js; no longer placed in the scene

The Quaternius modular character GLBs and mastjie cowboy/cowgirl remain embedded in models.js but are no longer placed in the scene. Patrons are original photo-baked textures on low-poly planes (see below). Box-figure people, a procedural bull and procedural bottles remain as a fallback if a model fails to load.

Quaternius Universal Base Characters (https://quaternius.itch.io/universal-base-characters, CC0) was considered but not used: the download is 122MB and itch.io may require an account.

## Textures (all CC0 / public domain)
- Wood Planks by Poly Haven (CC0) — https://polyhaven.com/a/wood_planks
- Wood Floor by Poly Haven (CC0) — https://polyhaven.com/a/wood_floor
- Leather 011 by ambientCG (CC0) — https://ambientcg.com/a/Leather011 — licence: https://ambientcg.com/license
- Leather 030 by ambientCG (CC0) — https://ambientcg.com/a/Leather030 — saddle leather
- Metal 032 by ambientCG (CC0) — https://ambientcg.com/a/Metal032 — licence: https://ambientcg.com/license
- Bricks 075A by ambientCG (CC0) — https://ambientcg.com/a/Bricks075A — washed dirty upper walls
- Plaster 001 by ambientCG (CC0) — https://ambientcg.com/a/Plaster001 — stained ceiling
- Wood Floor 043 by ambientCG (CC0) — https://ambientcg.com/a/WoodFloor043 — grey-brown worn floorboards
- Wood (bar) from ambientCG CC0 wood set — dark stained bar / wainscot (texBarWood)
- Fabric 045 by ambientCG (CC0) — https://ambientcg.com/a/Fabric045 — tinted and stained for the worn vinyl ring
- Animal hide / bull hide derived from ambientCG CC0 leather, darkened and used on the mechanical bull body

## Original character textures
Full-body patron textures (cowboy, biker, tank-top, bartender) were generated for this game, cut to transparent PNGs, and baked onto low-poly double-sided planes. They are original art for BUCK UP, not third-party character models, and include no Rockstar, GTA, or real-world brand marks.

Models and textures are embedded in models.js (base64) so the game can run from a local file:// page without fetching them at runtime.

Neon signs (BUCK UP, RUSTY SPUR), chalkboard menus, hanging clutter, the yellow vinyl padded ring and black rubber base, the metal hydraulic post, and the procedural mechanical rodeo bull (body, head, horns, saddle and grip) are original to this game. No real-world brands are used.

Posters, neon (HOG WASH, EL TORO, COLD BEER, RUSTY SPUR, BUCK UP), murals, jukebox and pool table are original art for this game. No Rockstar, GTA, or real-world brand marks are used.

- Saloon by Poly by Google (CC-BY 3.0) — https://poly.pizza/m/82JBTSsWag4 — downloaded and scanned for this pass; not swapped over the current interior so the keep-list bar textures stay in place.

- Quaternius Universal Animation Library and Universal Animation Library 2 (CC0 1.0) — https://quaternius.com/packs/universalanimationlibrary.html — Idle_Loop, Dance_Loop, Idle_Talking_Loop, Idle_Rail_Call and Yes clips, pruned and retargeted onto the existing Ultimate Modular Men/Women rigs. Characters themselves are already credited Quaternius CC0 packs.
- ambientCG (CC0) 1K color maps, crunched to 256px and tiled: WoodFloor051 (floor), Planks012 (planks), Wood051 (bar wood), Bricks075A (brick walls), WoodSiding012 (wall/plaster), Leather011 and Leather008 (leather), Metal032 (metal). https://ambientcg.com/


## Step 2 — GitHub shaders and assets (16 Nov 2026)
- lferreira457, threejs-psx-shader (MIT) — https://github.com/lferreira457/threejs-psx-shader — vertex-snap GLSL adapted into `assets/shaders/ps2_vertex_snap.glsl` and the file:// UMD wrapper `assets/shaders/ps2Shader.js`. Used mildly for a PS2 feel (512×288 snap grid, affine warp off). No dither, CRT, 15-bit colour, or 320×240 upscale from that package is used. Full licence text: `assets/shaders/LICENSE-lferreira457-threejs-psx-shader.txt`.
- Kenney, Starter Kit 3D Platformer (MIT) — https://github.com/KenneyNL/Starter-Kit-3D-Platformer — `sprites/blob_shadow.png` used as the ground blob-shadow decal (`assets/github_assets/blob_shadow.png`). Licence: `assets/github_assets/LICENSE-KenneyNL-Starter-Kit-3D-Platformer.txt`. Platformer meshes (bricks, coins, character) were inspected and not used — they are not bar props, and the current Quaternius modular crowd is already a better character set.
- Existing Kenney Furniture Kit and Quaternius bottles / bar counters / bull / modular characters remain those already credited above (CC0), already embedded in models.js. Official Kenney/Quaternius GitHub repos searched for additional bar/saloon GLBs (stools, bottles, barrels, signs) did not contain suitable interior props (starters are platformer / FPS / city-builder only). No vehicles were added.

## Step 3 — itch.io hot-swap loader (16 Nov 2026)
- The hot-swap loader (`assets/itchLoader.js`), empty manifest stubs, and `update-itch-manifest.command` helper are original to BUCK UP. They do not bundle third-party models until Juani drops licensed files into `assets/itch_incoming/` and runs the helper.
- three.js r147 FBXLoader and fflate.min.js (MIT), loaded from unpkg, are used only when an `.fbx` is listed in the manifest.

## Drop-in itch models (16 Nov 2026, backup 2026-11-16_0345)
Included (all CC0 1.0, no sign-up download from Poly Pizza's public CDN):
- "Worker", "Casual Character", "Punk", "Farmer", "Hoodie Character" by Quaternius (CC0 1.0) — from the Ultimate Modular Men Pack, https://poly.pizza/bundle/Ultimate-Modular-Men-Pack-ZiH8muWqwQ (individual models also on Poly Pizza). Used as bartender and crowd, with idle / wave / interact clips.
- "Animated Woman" (Formal) by Quaternius (CC0 1.0) — https://poly.pizza/m/nIItLV9nxS
- "Animated Woman" (Casual) by Quaternius (CC0 1.0) — https://poly.pizza/m/qJ2gsTUBHL
  These two use the same CharacterArmature and 24-clip set as the Modular Men pack (treated as the modular women counterparts).
- "Woman in Tank Top" by Quaternius (CC0 1.0) — https://poly.pizza/m/XqzeZGB7iU — used as a bar-top dancer (idle / clapping / standing clips). This one is from Quaternius's earlier animated-women set, not the April 2022 Ultimate Modular Women zip.

Downloaded and inspected, but not included:
- "Cowboy" by mastjie (CC0 1.0) — https://poly.pizza/m/S8hq7LEXTT — no animation clips; would freeze the keep-list crowd.
- "Cowgirl" by mastjie (CC0 1.0) — https://poly.pizza/m/bB93W7ZTmG — same, no clips.
- "Bottles" by Quaternius (CC0 1.0) — https://poly.pizza/m/UpU7H3QbAR — one combined Environment_Bottles mesh, not a single bottle; swapping it onto each shelf bottle would squash a whole cluster into one bottle. The game already uses the Quaternius bottles kit in models.js.
- "Tavern" by Don Carson (CC BY 3.0) — https://poly.pizza/m/2twvfQfSlHB — 27 unnamed meshes, no clean mapping onto counter / stool / barrel slots.
- "Bar scene" by Poly by Google (CC BY 3.0) — https://poly.pizza/m/cEbi0acnY23 — a single 4.8 MB baked mesh, no extractable parts. Too large to embed, and the saloon slot is reserved for Juani's Sketchfab file.

The official Ultimate Modular Women Drive folder (https://quaternius.com/packs/ultimatemodularwomen.html) presented a Google virus-scan confirm page, so individual Poly Pizza GLBs were used instead. The mechanical bull was not replaced. A vacant `bar/saloon.glb` slot is wired and falls back silently until Juani drops that file in.

## Sketchfab CC BY models (16 Nov 2026, backup 2026-11-16_0440)
Juani supplied these CC BY 4.0 models to be tucked in unobtrusively. Textures were downscaled to 128 or 256px (NearestFilter); meshes were decimated. No animation clips were present, so the characters stand at the back of the room and do not replace the animated Quaternius crowd.

Included:
- "Farm (low poly)" (https://skfb.ly/otPnE) by Avmifi is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/). Distant scenery outside the doorway.
- "Cowboy Confidence" (https://skfb.ly/pNpKF) by restore50 is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/). Still background figure, back-left corner.
- "GTA sa NPC 1" (https://skfb.ly/pE7Ys) by Uususykoolaid is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/). Fan-made SA-style NPC by a third party. Body, red tracksuit, sneakers, watch, gold, cross chain, and a basketball jersey numbered 15 — no Rockstar logos or branding on the textures, so it is included. Still figure by the doorway.

Provided but not included in this pass:
- "Summer Confidence" (https://skfb.ly/pNGDE) by Grauwolf is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/). The source GLB (~92 MB, ~1.02M verts) could not be copied off Juani's Mac while the machine was offline; no animation clips. Can be optimized and placed as a matching back-right figure when the file is available.

In-game credit is title-screen only (small low-contrast line; press C to expand). Nothing during the ride.

## 16 Nov 2026 (backup 2026-11-16_1245) — red leather, neon signs, Modly
- Poly Haven, "Leather Red 03" (CC0 1.0) — https://polyhaven.com/a/leather_red_03 — downscaled to 256px and slightly muted for the amber sun, used on the padded bull-ring and the saddle (not the bull hide, straps, or rope).
- Quaternius, "Cyberpunk Signs" (CC0 1.0) — https://poly.pizza/m/rsZJjigt1X — 3D sign meshes on the existing wall-poster spots. The atlas (256px, warmed) has generic OPEN/SHOP, pictograms, and everyday Japanese words; no brand logos or official names.
- Modly by Lightning Pixel (MIT) — https://github.com/lightningpixel/modly — local image-to-3D tool (v0.4.3 was running). No generated characters shipped in this pass: Documents/models was empty (API `Available: []`), so no GLBs could be produced without downloading a first-time generation model. A bandana-guy source was also skipped because the only bandana portrait on the mood board is a celebrity likeness (ref5).
- Kenney Furniture Kit was not added: no clean no-signup zip was fetched in time, and stools/tables are only used if they map cleanly onto existing slots.

## 16 Nov 2026 (backup 2026-11-16_1415) — gothic fail splash
- KaTeX_Fraktur Bold (SIL Open Font License 1.1) — https://github.com/KaTeX/KaTeX/tree/main/fonts — Copyright (c) 2009-2010 Design Science, Inc.; (c) 2014-2018 Khan Academy. Unmodified, self-hosted in assets/fonts (KaTeX_Fraktur-Bold.ttf, KaTeX_Fraktur-OFL.txt) and embedded as a base64 @font-face in style.css. Used only for the "Bucked" fail splash (original wording). Not a Rockstar font.

## 16 Nov 2026 (backup 2026-11-16_1440) — CRT feel, cowhide bull, star lanterns, arched windows
- No new third-party assets. The CRT grain tile, the cowhide texture, the star-lantern geometry and the arched window trim are all generated in code (original work, no licence needed).
- 2026-11-16: Exterior (facade, highway, palms, low-riders, signs) is original, generated in code. KaTeX_Fraktur is no longer used in the game (Bucked overlay removed); font files remain in assets/fonts.

## Street props (Poly Pizza, CC BY 3.0) — assets/street_models.js (textures reduced to 128 px, embedded as base64)
- "Queen Palm Tree", "Convertible", "Car", "Telephone pole" by Poly by Google (https://poly.pizza), CC BY
- "Camaro" by jacobleee05 (https://poly.pizza/m/LHXdhj95By), CC BY
No Rockstar/GTA files or branding. Downloaded 2026-11-17.
- 2026-11-17 more street props from Poly Pizza: "Street Light" (Quaternius, CC0/Public Domain), "Lamp post" (Kay Lousberg, CC0), "Dumpster" (KolosStudios, CC BY), "Hydrant" and "Motorcycle" and "Traffic light" (Poly by Google, CC BY), "Mailbox" (CreativeTrio, CC0), "Trash can" (Quaternius, CC0), "Vending Machine" (Don Carson, CC BY). Textures reduced to 128 px.

## Kenney – Animated Characters Protagonists (added 2026-11-17)
- Source: https://kenney.nl/assets/animated-characters-protagonists (v1.1) — by Kenney (www.kenney.nl)
- Licence: CC0 1.0 (public domain, no attribution required; credited anyway)
- Used: characterMedium model + criminalMaleA / skaterMaleA / skaterFemaleA / cyborgFemaleA skins, idle + run animations. Converted FBX→GLB, skins resized to 128px, packed in assets/kenney_chars.js. Replaces the blocky cop/prisoner/punk characters on the porch, street and behind the bull ring.

## "PS2 Styled Characters" by Wobble Blocks (added 2026-11-17)
- Source: https://opengameart.org/content/ps2-styled-characters
- Licence: CC0 (credit optional; the author asks to tag @WobbleBlocks if used)
- Used: rigged male + female PS2-era base meshes with painted faces and hair. I split them per material, recoloured the outfit/skin textures into 10 variants, resized textures, and drive the rig with simple code (idle/walk/dance). These are now the main bar crowd, porch dancers and street peds (Kenney characters are the fallback).

## Kenney – Retro Urban Kit (added 2026-11-17)
- Source: https://opengameart.org/content/retro-urban-kit (also kenney.nl) — by Kenney
- Licence: CC0 1.0 (credit optional; credited anyway)
- Used: parked trucks, desert shrubs, road barriers, street lamps, shed roofs and pallets (textures embedded at <=128px) in assets/urban_props.js.

## Sketchfab animated characters (added 2026-11-17)
All CC BY 4.0 (credit required; credited here). Textures resized to 128px, animations trimmed, packed in assets/sk_chars.js.
- "BadAssJailer" by RG3D (https://sketchfab.com/Reifus.Rufus), https://sketchfab.com/3d-models/badassjailer-c076ae16cf17416c93d8371c84c50bbf — licensed CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Used: patrolling street thug + a lurker by the lot.
- "psx man" by petya-petyavich, https://sketchfab.com/3d-models/psx-man-41b0580d4d5c4cc183cfeae523ea0a09 — licensed CC-BY. Used: street guy.
- "Ceomi - Woman dancing." by BloedSkrif (https://sketchfab.com/BloedSkrif), https://sketchfab.com/3d-models/ceomi-woman-dancing-7ec522873aba405485ba75ec9841dcec — licensed CC-BY (Creative Commons Attribution). Used: lead porch dancer + a dancer behind the bull ring (first 5 seconds of the dance, ping-pong looped, animation thinned to save size).

## Sketchfab San Andreas-style street dressing (added 2026-11-17 evening)
All CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/), free, credit only. Textures resized, packed in assets/gta_street.js.
- "Gangster Brute Guy" by SmoothYup (https://sketchfab.com/smoothYup), https://sketchfab.com/3d-models/gangster-brute-guy-19a5403b0424418db2ec527a17a33d9b. Used: gangsters on the lot and in the bar crowd.
- "LP Chevrolet Impala 1960" by yanot (https://sketchfab.com/yanot), https://sketchfab.com/3d-models/lp-chevrolet-impala-1960-c1b084464f21414585d4c655ed894089. Used: hydraulic lowrider cruising the highway + one parked on the lot.
- "PS2 car pack" by zaidluigi64 (https://sketchfab.com/zaidluigi64), https://sketchfab.com/3d-models/ps2-car-pack-70c0c8f8c34f49f59b8a5ab0c51a9bd9. Used: parked cars on the lot and roadside.
- "Thug Gold Digger City Van Low Poly gangster" by 00amza (https://sketchfab.com/00amza), https://sketchfab.com/3d-models/thug-gold-digger-city-van-low-poly-gangster-4d2a5377f4a746f2b809856000f6e87c. Used: van parked across the road.
- "Slum House" by akshathrao26 (https://sketchfab.com/akshathrao26), https://sketchfab.com/3d-models/slum-house-2473e58947004b3fadc5daa6fad6afeb. Used: building beside the bar.

## Asphalt031 (ambientCG)
- Asphalt 031 colour map, CC0 (public domain), https://ambientcg.com/view?id=Asphalt031. Cropped, resized to 128px and colour-graded; baked into ps2textures.js and used for the road. Credit given though not required.
- Quaternius Street Pack, CC0, https://opengameart.org/content/lowpoly-modular-street-pack (downloaded, not yet used in the game).

- Bricks097 (ambientCG, CC0 1.0) - colour map cropped to 128px, warm-graded, baked into ps2textures.js (PS2.brickCanvas); used under the shop fronts across the street. Graffiti tags are original, painted in code.


- Universal Base Characters (Standard) - Quaternius, CC0. Body/hair/beard models in assets/ubc_chars.js (textures resized). Clothing textures painted originally for this game from the model's UV layout.

## Poly Haven PBR pack (added 2026-11-22), all CC0 (public domain), polyhaven.com
- HDRI "Cowboy Town Saloon" (1K) https://polyhaven.com/a/cowboy_town_saloon: image-based lighting for the whole scene.
- "Bar Chair Round 01" https://polyhaven.com/a/bar_chair_round_01: 8 stools along the bar (replace the old stools).
- "Wooden Barrels 01" https://polyhaven.com/a/wooden_barrels_01: barrels in the bar corners.
Textures resized to 512px; packed in assets/pbr_pack.js. Credit given though not required.
- Poly Haven CC0 textures (added 2026-11-22, polyhaven.com): "Wood Floor Deck" (floor), "Weathered Brown Planks" (walls), "Wood Table Worn" (bar counter), "Dark Wood" (ceiling). 1K colour, 512px normal/roughness; in assets/pbr_pack.js.

## Realistic scanned people (added 2026-11-22), all CC BY 4.0 via Sketchfab, by Renderpeople (https://sketchfab.com/renderpeople)
- "Manuel Animated 001 - 3D Dancing Man" https://sketchfab.com/3d-models/manuel-animated-001-3d-dancing-man-e65e0fef4e0743868c8d5bff36d61116
- "Sophia Animated 003 - Animated 3D Woman" https://sketchfab.com/3d-models/sophia-animated-003-animated-3d-woman-dc448c3be0e74f96a55fb475a13433cf
- "Nathan Animated 003 - Walking 3D Man" https://sketchfab.com/3d-models/nathan-animated-003-walking-3d-man-143a2b1ea5eb4385ae90a73657aca3bc
- "Carla Rigged 001 - Rigged 3D Business Women" https://sketchfab.com/3d-models/carla-rigged-001-rigged-3d-business-women-acf520f450d14dd799f98a6fede3edf5
- "Eric Rigged 001 - Rigged 3D Business Man" https://sketchfab.com/3d-models/eric-rigged-001-rigged-3d-business-man-a46bc9f67aaa415bb4f3241eef900e7f
Licence: CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/). Textures 1K JPEG, animations trimmed; Manuel's dance is reused on Nathan, Carla and Eric. Packed in assets/real_pack.js. They replace the low-poly crowd inside the bar.
- "Black Bull" by Znvne179 (@daychiefaden8), https://sketchfab.com/3d-models/black-bull-6cab97514b0d404395c7aaad99e25bd1, CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/). Used as the body of the mechanical bull (lower legs trimmed, texture 1K). In assets/real_pack.js.
- Bartender "baddie_02_bartender": original BUCK UP art by Gofer, turned into a 3D model by Player Two with TRELLIS (Hugging Face, free). Arms lowered from the A-pose; in assets/real_pack.js.
- Poly Haven CC0 textures (added 2026-11-22): "Painted Plaster Wall" (walls, warm adobe tint), "Red Plaster Weathered" (lower wall band). In assets/pbr_pack.js.

## 22 Nov (street + wall art pass)
- Golden-hour sky, mountains, road sun-glare, dirt ground, stucco shop sides, wall posters (rodeo / BADDIES RIDE FREE / QUEENZ / bandana / WANTED / LAST CALL), sunset-bull mural and neon trim: original art drawn in code in scene3d.js (no downloads, no third-party assets). Backup: backups/2026-11-22_2135.

## 22 Nov (open-source street pass)
- Poly Haven (CC0, https://polyhaven.com): textures asphalt_02, concrete_pavement_02, yellow_plaster_02, worn_brick_wall, peeling_painted_wall (1K diffuse, 512 normal/roughness) in assets/street_pack.js: road, sidewalk lot, shopfront plaster and brick.
- ambientCG GraffitiSet001 (CC0, https://ambientcg.com/view?id=GraffitiSet001): graffiti tag atlas used as wall decals (bar outer walls and street shopfronts).

- The Bitter Blonde buckle-belt sign (assets/bb_sign.js): original artwork supplied by Juani ("buckle belt vector.png"). Leather belt, neon lettering, saloon cladding, marquee bulbs and street-brawl choreography are original code art, no third-party assets.

- World props (street lamps, neon blade signs, bins, hydrants, cones, bus shelter, barrel fires) and all crowd/street/fight sound are original procedural code (Web Audio synthesis), no third-party assets.

- Jukebox by Rescue3D Assets, CC BY 4.0, https://sketchfab.com/3d-models/jukebox-188e71ce378f4b6786054d9f74dd3a25
- White-Tailed Deer Skull With Antlers by RISD Nature Lab, CC BY 4.0, https://sketchfab.com/3d-models/white-tailed-deer-skull-with-antlers-29bccce82a184e93bea39933d33b4760 (simplified)
