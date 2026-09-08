# Doodle Derby — isometric diorama asset direction

## Decision and reference

The user selected Roman Klco's **Isometric Cities** collection on 2026-09-08 as the visual direction for all Doodle Derby assets.

Reference: https://www.behance.net/gallery/109661587/Isometric-Cities

This applies to the existing Doodle Derby game, not a separate San Francisco explorer. Create original models that share this visual language. The reference artwork is inspiration, not a source of game-ready models.

Status: first native 3D production test complete: Toast Malone, Street Wheels, and one tintable Painted Lady. Editable Blender source and a rendered study are in `asset-workshop/output/`. GLB exports are loaded by the local game. The remaining catalogue still uses the existing procedural models.

## Shared visual language

- Recognizable, compact primary forms, with modest bevels and rounded edges that catch the light.
- Deliberate geometric detail: rooflines, framed windows, object handles, and vehicle-specific silhouettes. Details must read at the actual gameplay size.
- Clean, color-blocked surfaces with broad, restrained highlights. Avoid uniform flat shading on every surface, heavy drawn outlines, or noisy textures.
- A coordinated family of cream, blue, warm red, soft green, and dark neutral materials, based on the observed reference. Preserve clear blue and coral player identification.
- Warm directional light with cool ambient fill and grounded shadows. Match the browser rendering setup before expanding the asset library.
- Use a fixed elevated three-quarter view for asset comparisons. The game's perspective chase cameras remain the production validation view; adopting this art direction does not require an orthographic race camera.

The reference collection contains different lighting moods. Its exact Blender settings were not recovered. Numeric production settings will be chosen and tested locally.

## Recommended production pipeline

1. Use Blender to author reusable geometry and exportable materials. Shared Python builders can generate consistent bevels, trim, wheels, and palette variations.
2. Export optimized GLB files for Three.js. Keep source Blender files and generation scripts alongside a manifest.
3. Use Three.js for loading, arrangement, browser lighting, cameras, wheel motion, and visual response to the existing simulation.
4. Keep exact drivable surfaces and terrain placement generated from the existing track definitions. Decorate those surfaces without changing the collision geometry.
5. Use ImageGen only when useful for concept references or texture assets. Raster images do not replace the meshes required by the rotatable showroom and moving race camera.

A Blender render is not automatically identical to a browser render. Approve the first exported asset in the actual Three.js lighting and camera setup, then reuse those settings.

## Existing asset scope

Current models are constructed programmatically in `game/visuals.ts` and rendered by `game/renderer.ts`.

- Vehicle bodies: toaster, bathtub, sofa, dumpster, suitcase, lunchbox, canoe, banana, ironing board, shopping cart, fridge, and arcade cabinet.
- Shared vehicle pieces: three wheel families, driver, steering details, chassis elements, and player pennant.
- Environment: Painted Ladies, Golden Gate bridge structures, Coit Tower, Transamerica Pyramid, background buildings, and boat.
- Track-side scenery: hay bales, trees, spectators, race flags, signs, brick garden borders, bushes, and flowers.
- Structural surfaces: road pieces, boundaries, terrain, and water.

## First production test

Build one representative kit before producing the whole catalogue:

- Toast Malone toaster vehicle body, using the existing body's physical dimensions.
- Street Wheels, driver, and player pennant as separate reusable parts.
- One Painted Lady building.
- One hay bale, pine tree, spectator, and race flag/sign.
- A short section of the existing road for viewing the kit in context.

The toaster exercises rounded manufactured forms; the building exercises architectural detail; the smaller props establish detail density and shared scale. A cable car and streetlight are not part of this initial kit because they are not present in the existing game.

## Production checks

- Preserve catalogue dimensions, chassis origin, forward direction, wheel centers, axle orientation, and configurable wheel placement.
- Keep wheels separate from chassis meshes so the existing physics poses drive them independently.
- Keep player-color surfaces identifiable for per-player material assignment.
- Do not include a display plinth, environment, or cast ground shadow inside an individual reusable model.
- Maintain common scale, material names, bevel treatment, and detail thickness across the library.
- Inspect models from all sides, in the showroom, and through the actual 54-degree race cameras.
- Verify that visible track surfaces still coincide with the physics definitions.
- Check loading, missing-asset behavior, shared-resource disposal, and two-player rendering performance when integrating GLB models.

## Current setup

The game uses Three.js. Blender 5.2.1 LTS is running from `/Volumes/Blender/Blender.app`. Background generation requires access to the Mac graphics device; a separate background process builds the source file without changing the user's open Blender document.

## First test deliverables

- `asset-workshop/output/doodle-derby-study.blend`: editable components, live bevels, materials, and study lighting.
- `asset-workshop/output/doodle-derby-study.png`: composed Blender render.
- `public/models/toast-malone.glb`: 26,124 triangles, 8 material batches, 706 KiB.
- `public/models/painted-lady.glb`: 68,532 triangles, 8 material batches, 1,985 KiB; `Facade` tintable.
- `public/models/street-wheel.glb`: 10,748 triangles, 6 material batches, 301 KiB; `PlayerColor` tintable.

`game/assets.ts` loads the GLBs before scene construction. Failed loads use the previous procedural models. Each cloned instance owns its geometry/materials so vehicle changes do not dispose other instances. Actual GLB indices, normals, bounds, axes, showroom display, and race display were checked. The existing brighter game lighting is retained for this first test; matching the study's softer lighting is a future art pass. These are initial meshes with material batching, not a final mobile geometry budget.

## Technical references

- Three.js GLTFLoader: https://threejs.org/docs/pages/GLTFLoader.html
- Blender glTF exporter documentation: https://github.com/KhronosGroup/glTF-Blender-IO/blob/main/docs/blender_docs/scene_gltf2.rst
