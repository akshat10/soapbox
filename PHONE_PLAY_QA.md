# Phone play release check — September 8, 2026

Passed in isolated Chrome browser contexts with native Metal GPU: one real shared host and four independent phone sessions, using the real room service.

- Four different player slots joined, chose parts, readied, and automatically started the race.
- Every phone rendered its own 3D chase view at 390 × 844. Controls and canvas stayed within the viewport, with no race-page scrolling.
- Landscape at 844 × 390 kept the full race view and thumb control usable.
- A press gave immediate local feedback, increased the host's measured charge, and release produced a physical jump.
- All four racers finished the first heat. Next-heat readiness survived the results-to-garage transition, and heat two started automatically.
- No JavaScript runtime errors. The only missing resource was the browser's fallback favicon; an explicit SVG icon was added before the final build.
- The test room and browser contexts were closed after the run.

The production build passed. Simulation and room checks passed for hop/recovery behavior, representative SF builds, four-lane fairness, race scoring and ties, ordered controller handovers, next-heat readiness, full pose transport, and scenery batching.

This verifies browser behavior and the actual multiplayer protocol. Physical phone frame rate, touch comfort, and cross-network latency still require device playtesting. The host screen must stay open and visible; it runs the authoritative simulation. Steering and winding track progression are a separate upcoming change.

Local screenshots and machine-readable report are in the ignored `output/playwright/` folder. Shared-screen and branding QA is documented in [SILICON_RACER_UI_QA.md](SILICON_RACER_UI_QA.md).
