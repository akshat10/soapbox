# Doodle Derby — first SF parts

September 8, 2026. User-authorized scope: three expressive chassis and three independent wheel sets. Gadgets deferred by user.

Editable source: `sf-parts.blend`. Rendered overview: `sf-parts-study.png`. Separate game GLBs and 640px transparent thumbnails: `public/models/sf/`. Production scripts: `asset-workshop/batches/sf/`; repeatable export/render: `asset-workshop/build_sf.py`. The source scene includes presentation translations; GLBs are exported at their contractual local origins before those translations.

| Chassis | Object | Bolts | Width / height / length | Driver seat Y / Z |
|---|---|---:|---|---|
| Sourdough Starter | Hollow scored loaf | 2 | 1.8 / 1.25 / 2.5 | .22 / -.25 |
| Mission Missile | Tortilla, foil and filling | 3 | 1.7 / 1.05 / 3.5 | .22 / -.25 |
| Rent Controlled | Mint Victorian porch and canopy | 3 | 2.2 / 2.3 / 2.9 | -.63 / -.18 |

| Wheel set | Radius | Width | Bolts |
|---|---:|---:|---:|
| Skate-Park Wheels | .33 | .24 | 2 |
| Scooter Wheels | .5 | .27 | 3 |
| BART Discs | .64 | .30 | 4 |

Axes: X right/axle, Y up, +Z forward. Every wheel is a single module copied four times. Chassis omit drivers, flags and wheels. All objects retain named editable components; runtime exports batch evaluated geometry. No textures or outside dependencies. All six GLBs total 1,390,964 bytes and 50,036 triangles. Skate is 6,380 triangles and porch is 15,028, slightly above initial authoring targets; further mobile performance optimization remains possible.

Validation: all six GLBs parse, normals are finite/unit, indices valid, bounds match manifest and no presentation geometry/cameras/lights are exported. Wheel radii and X-centered origins verified. Scooter hub overhang corrected so full width is .27. Manifest distinguishes mesh batches from material primitives. Visual comparison against the provided chassis sheet and approved Blender study preserves the silhouettes, simplified colors, bevels and modular assembly. Live 1280×720 garage checks verified all three bodies, cockpit driver clearance, distinct wheels, actual part swaps and isolated selection thumbnails.

Physics: all nine standard-wheelbase chassis/wheel pairs completed the deterministic timed-hop check with exact parity across the first two lanes. Eight finished without recovery; Sourdough+BART used one. Porch COM .15 (instead of initial .23), mass140, preserves the canopy envelope while making all three wheel types viable. This is a prototype viability check, not comprehensive balance or four-player certification. The separate gameplay task is integrating four-player phone racing and owns its final validation/deployment.

Build passed. Targeted asset/catalogue/visuals lint passed. Full TypeScript check encountered in-progress four-player snapshot/PlayerId changes owned by the gameplay task; those were reported there. Concurrent hot reloads repeatedly reset the live race to the garage, so a sustained chase-camera visual pass remains for the gameplay integration task.

Reference: supplied `reference-art/sf-derby/03-chassis-bodies.png` and `04-wheels-contact.png`, customization notes in `SILICON_VALLEY_RACER_CUSTOMIZATION.md`, and the previously approved Isometric Cities / native Blender study. No gadgets, additional chassis, city kits or cosmetic systems were added in this batch.
