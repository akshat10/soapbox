# Physical steering and Bay or Bust course

September 8, 2026. Historical integration notes for the physical-steering and authored-course milestone. The implementation is now integrated; current behavior, checks, and release limits are documented in `README.md`.

## Runtime contract

```ts
physics.reset(builds, racerIds, {
  steeringEnabled: true,
  course: 'bay-or-bust',
});
physics.start();
physics.setSteering(playerId, normalizedInput); // -1 left, 0 center, +1 right
physics.setInput(playerId, hopHeld);
```

- Steering acts through the two front tires. Yaw and lateral movement are physical; no path-following or heading correction runs in production. The starting grid uses the existing four lateral lane offsets, with free movement after starting.
- Steering input clamps to `[-1, 1]`; non-finite input centers it. Wheel angle depends on wheelbase and speed, with a minimum target turn radius of `8 + 0.2 * min(speed, 10)` metres. Angle changes at 1.5 radians/second and returns to center at 2 radians/second.
- `cancelSteering(id)` centers steering without releasing Hop. `cancelInput(id)` cancels Hop without changing steering. `clearInputs()` cancels both without launching. Use separate pointer ownership for the two controls and cancel both on focus loss.
- Omitting the third `reset` argument preserves the chosen course and steering mode for the next heat. A fresh physics instance starts with classic fixed lanes. Explicit fallback is `{ steeringEnabled: false, course: 'classic' }`. A curved course with steering disabled is rejected.
- Snapshots add optional `courseId: 'bay-or-bust'`, `pathId`, and `pathDistance`. Events also include optional `pathId` and `pathDistance`; the existing `z` field remains world Z. Use snapshot `progress` for standings and validated race progress, and path distance for course cues and cameras. Do not multiply progress by the classic 260m length.

## Authored geometry and recovery

`game/course-layout.json` contains the final main-only layout supplied by the track task. `game/course.ts` exports `BAY_OR_BUST_COURSE`, including interpolated position, tangent, right and up vectors through `frame(distance, pathId)`. The complete ribbon is 431.54m; the painted start and finish are at 3.00m and 424.54m. World Z is not forward progress on this course.

Collision follows the authored road triangles, including the shoulders and raised curbs. Each of 430 road segments groups ten small convex prisms in one static body so both raycast tires and box chassis can collide with the surface. The visual course must match this layout and coordinate system. The previous overlapping shortcut has been removed from the authored course and is not enabled here. Props, gates and decorative pads do not have new reward mechanics.

Progress projects onto nearby road segments and checks plausible travel per physics step. Jumping or teleporting near a later bend cannot award skipped progress. Leaving the road for more than 0.45s, falling below it, stalling or overturning triggers the existing 0.8s recovery. Recovery places the racer slightly behind its last valid distance, close to its former lateral line and aligned with road grade and bank. Previously measured safe momentum is projected onto that heading.

Finished racers hold their winning pose at zero speed while the others finish. They generate no further landing, collision or recovery events. Cars still pass through one another, as in the released fixed-lane game; car-to-car collision is not introduced by this pass.

## Course cues and integration checks

- The two useful hop releases measured by the driving checks are near path distances **168.89m** and **396.74m**, after about **0.65s** of charging. These are initial cue candidates, not prescribed human input. Releasing 2m late still completed all four representative runs with 1–2 recoveries.
- Charging fully at the first crest can carry the car into the following bend while airborne, when the tires cannot turn it. Teach an early, controlled release and show the landing direction clearly.
- Use a **90s heat limit initially** for this longer course, then tune from human runs. The simulation does not set the application's heat timer.
- The runtime must connect independent steering and Hop gestures, clear stale input on disconnect/focus loss, and use the road tangent for chase cameras. Confirm these on an actual phone with a laptop host, including simultaneous touches, cancellation, orientation changes and reconnects.
- Check frame pacing and input delay before enabling the course for the demo. The simulation checks below do not certify phone rendering or network performance.

## Validation

The permanent four-racer driving check uses a test-only steering driver through the same public input methods available to the phone. No direct chassis steering correction is applied.

| Input pattern | Finish times | Recoveries |
| --- | --- | --- |
| Steering, no hops | 44.44–48.41s | 1 per racer |
| Steering with controlled hops | 43.55–44.26s | 0 |
| Steering with hops released 2m late | 45.88–56.76s | 1–2 per racer |

An additional independent matrix exercised all 27 SF body/wheel/spacing combinations with the shared controlled-hop pattern. All finished in 42.12–51.60s: 23 had no recovery, four Burrito configurations had one. This establishes completion with a repeatable steering driver, not equal competitiveness or novice difficulty.

Permanent checks cover left/right symmetry, clamping, independent cancellation, road/curb contact, spawn orientation, course-based progress, skipped-progress rejection, recovery, reset/fallback and a 12s finish window with stable poses and no new events.

```sh
node --import tsx game/steering-check.ts
node --import tsx game/course-driving-check.ts
node --import tsx game/physics-check.ts
node --import tsx game/feel-check.ts
npx tsc --noEmit --incremental false
npx oxlint game/physics.ts game/types.ts game/course.ts game/steering-check.ts game/course-driving-check.ts
```

Boosts, drift rewards, held items, live Astra coaching and phone/controller activation are separate integration work. The next acceptance criterion is a novice completing and enjoying a real phone run, with clear control and camera feedback.
