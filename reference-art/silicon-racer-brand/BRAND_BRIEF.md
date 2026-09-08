# Silicon Racer — brand exploration

> Historical exploration brief. The selected forest/vermilion identity is now integrated using a live 3D landing scene; statements below about pending integration describe the earlier exploration stage. See [archive README](README.md).

September 8, 2026. The user selected **San Francisco Soapbox Club**, the third displayed concept, as the Silicon Racer brand direction and wants it adapted into a splash screen. The game implementation still uses the existing Doodle Derby branding; this selection has not yet been applied to the live game.

## Selected name and line

**Silicon Racer**
**Big ideas. Bad brakes.**

An arcade racing game made by people who have spent too much time around startups. Players assemble absurd San Francisco objects into soapbox racers and send them downhill. The name carries confidence; the vehicles and writing deliver the joke.

Use the singular **Silicon Racer** consistently. A player can be a Silicon Racer; the game can contain many of them. **Silicon Derby** is the strongest alternative if we want the title to emphasize homemade racing more explicitly. **Burn Rate** works better as a tournament name than the main title.

## Brand character

- Competitive and playful: a ridiculous invention deserves a serious race.
- Locally specific: burritos, sourdough, Victorian porches, transit, steep streets, fog, startup billboards, and driverless pods.
- Warm and tactile: stay compatible with the selected miniature SF diorama art.
- Wry and confident: let the absurd object or a short line carry the humor.
- Readable in use: startup jokes should never replace essential controls, status, or error messages.

## Visual directions

### Hill Climb Arcade

A bold italic cobalt wordmark on warm cream with restrained coral depth, a checkered downhill-road motif, and a burrito racer. Fast, lively, and clearly a game. Retained as an exploration; the user selected San Francisco Soapbox Club instead.

Palette: cobalt `#2849E8`, coral `#F4624A`, cream `#FFF2D4`, fog mint accents. Use expressive display lettering paired with a plain, readable sans serif for controls. Keep illustration separate from the core wordmark so the logo remains usable at small sizes.

### Pre-Revenue Racing

A confident rounded lowercase wordmark in butter yellow on deep aubergine, with racing decals and a driverless prototype. Indie-game energy with startup satire in the applications.

Palette: aubergine `#211D36`, butter yellow `#FFDD63`, cream `#F8F3E8`, coral accents. Keep lower-case styling consistent in the logo; write the product name as Silicon Racer in ordinary prose.

### San Francisco Soapbox Club — selected

A compact hill-shaped racing badge in vermilion and forest green, using a restrained bridge/road motif. A local competition with enough character for a cart number plate, shirt, or loading screen.

Palette: vermilion `#E65339`, forest `#163C32`, cream `#F7F0DF`, fog mint `#C9DFD0`. Avoid over-detailed heritage emblems and tourist-souvenir styling. Small text is optional outside the primary wordmark.

## Voice examples

| Placement | Copy |
|---|---|
| Primary tagline | Big ideas. Bad brakes. |
| Garage helper | A big idea. Four tiny wheels. |
| Race introduction | The pitch is steep. |
| Winner flavor | Your idea has traction. |
| Crash flavor | An unexpected pivot. |
| Rematch helper | This version has potential. |
| Driverless pod name | Public Beta |
| Victorian porch name | Rent Controlled |
| Optional tournament name | Burn Rate |
| Cosmetic label | Stealth Mode |

Keep functional labels such as **Chassis**, **Wheels**, **Gadget**, **Ready**, **Hold to charge**, **Release to hop**, **Reconnecting**, and **Race again** straightforward. A crash joke must accompany an accurate recovery state, never hide it.

## Required production assets after direction selection

1. Primary wordmark and a compact stacked version.
2. A simple small icon that works at 32 px.
3. Single-color and light/dark logo treatments.
4. Palette and type rules for the garage, phone controller, and shared race screen.
5. One title-screen/game-link image using the SF racers.
6. Vehicle number, decal, and result-banner applications.

The generated boards are raster concepts. Production logo artwork should be redrawn as clean vector paths and checked for small-size readability, letter spacing, monochrome use, and compatibility with player identification. The selected title must be updated consistently across the game, phone join screen, page metadata, help, and share imagery when the rebrand is implemented.

## Selected splash refinement

The user requested a stronger illustration on the right. Preserve the selected badge, forest/vermilion/cream colors, name, and tagline. Recompose as a widescreen splash with one clear hero racer and a smaller rival, visible homemade chassis construction, simpler scenery, and a stronger downhill diagonal. Remove the brand-board footer with alternate marks and number tile. Keep clear space under the tagline for a real start control; do not bake controls into the illustration.

[Refined splash artwork — v2](silicon-racer-splash-v2.png) retains the selected badge and replaces the right-side composition with a larger airborne sourdough racer, visible timber frame and axles, a smaller burrito rival, and simplified Victorian/bridge scenery. The footer samples are removed. This is a single raster splash composition, not an interactive screen or a standalone extracted logo. The [exact edit prompt](splash-v2-prompt.txt) and generated file metadata are saved alongside it.

Keep this artwork separate from the gameplay team's application edits. Their current work targets full 3D racing on each phone and a spectator big screen for four racers. They own integration with the active race and phone flows; do not overwrite `DoodleDerby.tsx`, `DerbyUI.tsx`, or their CSS to apply this art independently. Keep eventual Start/Join actions live and accessible, positioned in the reserved cream area. For small-screen layouts, use dedicated logo and scene assets rather than shrinking the entire wide image until the lettering becomes illegible.

## Context

- [Customization specification](../../SILICON_VALLEY_RACER_CUSTOMIZATION.md).
- [Imported SF concept art](../sf-derby/README.md).
- [Current game art direction](../../ART_DIRECTION.md).

The generated identity explorations use the imported SF cityscape and modular chassis sheet as visual context. They are new brand proposals, not edits to those reference images.

## Generated concepts

The images below were generated with built-in ImageGen. The option numbers follow their actual display order in the conversation. The exact prompts are saved in [prompts.json](prompts.json), and image provenance and dimensions are in [manifest.json](manifest.json).

1. [Hill Climb Arcade](01-hill-climb-arcade.png)
2. [Pre-Revenue Racing](02-pre-revenue-racing.png)
3. [San Francisco Soapbox Club](03-sf-soapbox-club.png)

All three retain the correct game name and tagline and were visually inspected. Extra illustrative lettering is concept copy, not approved game content. The main wordmark, application wordmark, and small icon should be unified during production; this is particularly relevant to the third concept's badge and horizontal treatment.
