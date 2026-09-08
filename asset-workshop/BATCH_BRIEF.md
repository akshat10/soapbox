# Doodle Derby asset production — hard deadline

Start: 2026-09-08 20:05 UTC. All asset scripts must be ready by 20:23 UTC. Parent integrates and checks game before 20:35 UTC.

Create original native Blender meshes matching the approved study at `output/doodle-derby-study.png`: compact miniature forms, modest bevels, intentional geometric details, saturated but restrained colors, cream trim, warm/cool lighting in the preview. Inspect this image with an image-view tool. Reference art direction: Roman Klco's Isometric Cities (already selected, no further research required).

Write only your assigned Python module under batches/<batch>/. No edits to shared helpers or the game checkout. Other workers are active. Do not create additional agents or Codex sessions. Do not install packages, deploy anything, or open/control the user's Blender UI. Parent will run Blender, optimize, render and integrate your output. Finish a good first version quickly, then report the callable functions. No top-level model building or exports on import.

Use `from common import *`; shared helper API is in `common.py`. Parent puts that directory on sys.path. Each function takes no arguments and returns a root empty from `root(name)` with EVERY component parented to it. Script filenames/functions are assigned in your task prompt.

Game-space conventions: X right, Y up, +Z forward. Helpers convert coordinates internally; do not apply additional whole-root rotations. Vehicle root = physical chassis center, sizes (width,height,length); Y spans ±height/2. Decorative details may extend slightly. No wheels, drivers or pennants baked into vehicle bodies: parent adds separate reusable parts. Keep a central driver's space around X ±.38, near top Y=height/2, Z=-length*.12 (or tall bodies Z=length*.26). Existing driver rises .8 above chassis top. Aim for recognizable silhouettes even at 120px on screen.

Palette examples (use as coordinated starting points): DD_Cream #F3E6C8, DD_Butter #E9B851, DD_DeepInk #31474F, DD_Coral #DF6B55, DD_Metal #BAC3B9, DD_Rubber #29373D, cobalt #2F69AD, mint #75B3A0, violet #9B91BF. Material `PlayerColor` means recolorable player trim; `Clothing`, `Skin`, `Foliage`, `Facade` may be tinted by game. Most surfaces roughness .45-.7, rubber .85, small metal .35 roughness/.3 metallic. No textures, external images, text objects, logos, or emissive materials needed. Use actual mesh detail.

Performance: target 5k–15k triangles for vehicle body; <=3k per repeated small prop; <=8 material batches. Bevels usually 2–3 segments, tiny edges can be 1. Cylinders 12–24 sides. Fewer purposeful details beat hundreds of hidden mesh pieces. Parent joins evaluated exports by material, retaining editable original parts in Blender.

Vehicle catalogue: bathtub 2.15,.95,2.9; sofa 2.2,1.3,2.8; dumpster 2.1,1.45,2.7; suitcase1.6,.85,2.4; lunchbox1.7,1.05,2.25; canoe1.55,.8,3.8; banana1.5,.9,3.6; ironingboard1.4,.7,3.5; shoppingcart1.75,1.85,2.45; fridge1.65,2.4,2.3; arcade1.6,2.25,2.3.

Parent owns all exports and final .blend packaging. You may validate Python syntax; use `python3 -m py_compile your_file.py`. If construction needs a new helper, define it locally in your own module. Report dimensions, material names needing recoloring, and any clearance issues.
