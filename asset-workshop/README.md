# Doodle Derby — first Blender asset test

Open `output/doodle-derby-study.blend` in Blender to edit the toaster, Painted Lady, and Street Wheels. Named collections preserve individual mesh pieces and bevel modifiers. Presentation objects, camera, and lighting are excluded from each GLB.

Run `build_assets.py` using Blender's background Python to rebuild all three GLBs and the composed PNG. The original models were created with Blender 5.2.1 LTS. From the repository root, use `blender --background --python asset-workshop/build_assets.py` with your Blender executable. Scripts use game coordinates: X right, Y up, Z forward. `common.py` converts to Blender coordinates for export.

The optimized export evaluates modifiers on copies and joins geometry by material. Originals remain editable. Copy the three GLBs from `output/` into `../public/models/` after reviewing changes. The game loader preserves material names for facade and player-color variations.

The study is an original model set using the selected Isometric Cities visual language. It is a first test of geometry, material finish, and game integration. Remaining vehicle bodies, drivers, scenery, and game lighting are future work.

Validation: all GLBs use valid indexed triangles with finite unit normals. Toast 26,124 triangles / 8 batches, house 68,532 / 8, wheel 10,748 / 6. The manifest's evaluated polygon counts are pre-triangulation counts. Game collision bodies and wheel axle placement remain controlled by the existing catalogue and physics.
