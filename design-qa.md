# First Blender asset test — visual QA

final result: passed

Scope: native toaster, wheel and Painted Lady model test, not full scene restyling or a pixel-identical copy of the reference composition.

## Evidence

- Source visual: https://www.behance.net/gallery/109661587/Isometric-Cities/modules/628026619 (London lightbox). Captured through the in-app browser at 1153 × 1204 pixels.
- Blender implementation: `asset-workshop/output/doodle-derby-study.png`, 1400 × 1100 pixels.
- Browser implementation: http://localhost:5173/, 1280 × 720 pixels. Inline browser captures in this task show the loaded garage and the race at 7.3 seconds. The browser API returned image bytes without a filesystem screenshot path; these captures are recorded in the conversation.
- Source and race screenshot were supplied together in one comparison call. Different content/compositions and camera projections are intentional; no pixel-level spacing comparison was claimed. No density resampling applied.
- Focused examination: toaster in the center of the garage; Painted Ladies at the side of the race road; individual facade and toaster details in the full-resolution Blender study. Geometry details are clearly readable in the study, while simplified silhouette remains readable in the game.

## Findings

No blocking findings for this three-asset experiment. Rounded shell and wheel edges, framed windows, layered cornices, clean color blocking and blue/cream architecture carry the reference's visual language. The toaster is visible with its driver between the bread slices; four independent wheels sit correctly on the showroom plinth. The race shows native house instances and moving toaster/wheels in both player views.

- Fonts/typography: existing Doodle Derby UI retained; the art reference supplies no game typography. No new fonts or wrapping changes introduced by the asset pass.
- Spacing/layout: existing UI, perspective cameras, physical dimensions and road layout retained. GLB axes and origin placement validated directly.
- Colors/tokens: butter yellow, cream and dark neutral toaster; facade material supports the existing multicolor house row. Brighter game light and matte surfaces are intentional for the first integration test. Softer lighting and deeper saturated color are future art refinement.
- Image/asset fidelity: genuine rotatable meshes with bevels and PBR materials; no image planes or baked screenshots. All exported primitives have valid indices and finite unit normals.
- Copy/content: existing game content retained. No reference branding or text reproduced.

## Comparison history

Pre-export integration review found driver clearance too tight between toaster slices. Slot/bread centers moved to X ±0.51 before export; the final browser garage capture shows the driver seated visibly between the slices. Source .blend remains editable. Initial browser capture occurred during loading; final capture shows both models and enabled LET’S ROLL. Final race capture confirms the house instances and moving vehicle.

## Validation and limits

- TypeScript check passed after the asset integration; targeted lint passed for `game/assets.ts` and `game/visuals.ts`.
- Production build passed. Vite reports the existing large-bundle advisory; no build errors.
- Local route returned HTTP 200. Browser console check returned no errors/warnings in the newly connected capture session; server logs included the existing Three.js PCFSoftShadowMap deprecation warning during earlier startup.
- Started a race and visually verified loaded meshes. No complete three-heat or phone-controller test claimed for this asset-only change.
- Repository-wide lint has unrelated existing/template and concurrent phone-feature findings. Concurrent phone work changed other project files during this pass and was preserved.
- Follow-up P3: lower geometry budgets/LODs before expanding the full library; match runtime lighting more closely to the Blender study; replace remaining procedural catalogue after the art direction is accepted.
