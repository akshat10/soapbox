# Silicon Racer UI pass

Final result: passed for the landing, shared-screen lobby, local garage, race HUD and heat results inspected in this task. Four-phone integration and the production build are owned by the gameplay task for the combined release.

## Direction and assets

The approved source is `03-sf-soapbox-club.png`, refined by `silicon-racer-splash-v2.png`. The user explicitly requested a real 3D race scene on the right and a large Start button on the left, so the illustration's composition is adapted rather than copied pixel for pixel. The extracted badge retains the forest/vermilion identity on cream. The source badge and its lettering were visually inspected before integration.

The landing uses the game's actual sourdough and Mission burrito GLBs, their independent wheels and drivers, plus the Painted Lady building asset. It is a lightweight scripted attract scene: no competitive physics, no audio, 30 fps cap, capped pixel density, static rendering for reduced motion, and animation paused in hidden tabs. The underlying garage renderer is hidden while the attract scene is active. A native chassis thumbnail remains available if the 3D scene cannot load.

## Rendered evidence

Local preview: http://localhost:5173/. CUA screenshots are recorded inline in the task conversation.

- Desktop landing at 1440 × 900: badge, tagline, large vermilion Start, secondary Join a race, keyboard option, and two assembled 3D racers visible without horizontal overflow.
- Original desktop viewport around 1135 × 1204: same split composition, readable badge and controls.
- Phone landing at 390 × 844: stacked badge and actions above the fold, live scene below. Measured document width 390 pixels; scrollable content reaches 909 pixels tall.
- Shared-screen lobby at 1440 × 900: one QR/code block, four simple crew seats, readiness message, and persistent compact brand.
- Local garage at 1440 × 900: two cards with three SF chassis and three wheel sets each. Classics and optional wheel spacing remain accessible. Selected chassis and wheels have explicit checks/pressed states.
- Local race: small position/crew pills, global heat clock, contextual cue and compact hop control leave the 3D race visible.
- Heat results: ranked rows show the selected chassis, finish time, earned points and total, with one Next heat action.

## Flow verification

- Start waits until the game is initialized, creates a room, then moves directly to the lobby.
- Invite friends reopens QR/code sharing. End room closes the dialog and returns to the landing without creating another room.
- Keyboard option opens two independent garages. Changing player 1 to Victorian porch leaves player 2 unchanged.
- Chassis and wheel selections update separately. Stable PlayerId 0–3 types and sparse snapshot lookup are used across shared UI.
- A complete local heat reached results: 35.79 seconds / 5 points and 38.71 seconds / 3 points. Display agrees with shared game ranking.
- TypeScript check passed. Focused oxlint passed for all six UI/scene source files. Browser error logs were empty during the inspected run.

## Fixes made during QA

- New scene imports created during live development required a fresh page load; verified two canvases and a ready landing scene afterward.
- Fixed a pre-existing `.phone-mode` class collision that laid the TV header beside the lobby.
- Removed shared card height overrides that would suppress the phone's larger selected-racer preview.
- Kept the selected Classic's family visible even when selection changes via the phone carousel.
- Added readiness gating for Start and direct transition after room creation.
- Used Next Image/Link and semantic status output to meet project lint rules.

No unresolved P0/P1 UI findings in this pass. The badge is an opaque cream raster with minor background variation, visually blended into the matching cream surface. Exact illustration scenery, unbuilt chassis and proposed gadgets were not represented as available game features.
