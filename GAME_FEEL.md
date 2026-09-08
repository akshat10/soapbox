# Game feel pass — 8 September 2026

The demo priority is exciting, responsive play and quick rematches. Balance work serves that goal by removing swallowed input, hopeless setups, and repeated crash loops. This pass preserves the physical hops, distinct masses, and dramatic mistakes.

## Implemented mechanics

- A charged release works for 120ms after losing wheel contact. The spring retains its existing ground charge during that window; it cannot charge in midair. A launch consumes the grace window, preventing double hops.
- A descending tap up to 120ms before landing waits for wheel contact and launches a small hop. Earlier taps expire. Focus loss and controller cancellation discard buffered input.
- The pit crew takes 0.8 seconds, down from 1.35. An overturned car is recognized after 0.7 seconds, down from 1; a stalled car after 1.8 seconds, down from 3.5.
- Recovery rights the car just behind its crash by `body.length * 0.6 + 0.5` meters, clamped to the start. It restores previously measured safe momentum and resets the spring. It never moves a car farther along the road than its crash position (except returning a car that rolled behind the starting line to the start).
- Holding the button through recovery resumes charging on ground contact. Releasing or canceling during recovery prevents an automatic hop; a fresh gesture still works.
- The Golden Gate trench has a continuous physical exit from its lower floor at z87 to road level at z94. Rendering and collision use the same track definition. The exit and local recovery together prevent an endless replay of the same missed jump.
- The porch center of mass is 0.08 instead of 0.15. All nine SF wheel/spacing combinations clear the timed reference run without a recovery. Its size, mass, and spring energy remain distinct.

## Measured behavior

The baseline tested all 27 combinations of three SF bodies, three SF wheels, and three axle spacings. All 27 failed to finish a 90-second no-input run because they repeated the bridge crash. The short porch with BART discs also repeatedly flipped in the opening bumps even with the reference timed input.

After these changes, the committed `game/demo-check.ts` exercises every SF setup with identical inputs in all four lanes:

| Scenario | Result |
| --- | --- |
| No input / missed jumps, all 27 setups | All finish in 33.77–38.94 seconds, with 1–3 recoveries |
| Two deliberate hops, all 27 setups | All finish in 31.73–35.62 seconds, with 0–1 recoveries |
| Same build, timed versus coasting | Timed is faster for every setup |
| Identical input across four lanes | Finish times agree within 0.02 seconds |
| Default builds, releases 2 or 4 meters early/late | All finish within 45 seconds, at most 3 recoveries |
| All 15 bodies on standard wheels/spacing | Reference timed run completes cleanly |

Control regressions cover charge cap, same-frame phone taps, sparse player IDs, grace and expiry, no double hop, landing buffer and expiry, per-controller/focus cancellation, and hold/release/cancel through recovery.

Run from the project directory:

```sh
node --import tsx game/feel-check.ts
node --import tsx game/demo-check.ts
node --import tsx game/physics-check.ts
node --import tsx game/sf-physics-check.ts
```

These are deterministic simulation checks, not evidence of human-tested fun. Rapid 100ms tapping still slows progress by keeping the wheels off the downhill road; clear hold/release teaching and actual phone playtests matter. Transport latency, audio, cameras, standings, and the combined UI are handled in the phone gameplay task.

## Integration and next course

This pass preserves the four-player simulation interface and current straight course. The phone gameplay task owns combined build, browser/device checks, and publication; no independent deployment is made from this pass.

The user has separately selected steering for the future course. Curved driving needs path-based progress, checkpoints and recovery anchors, real yaw/lateral motion, collision decisions between racers, and camera/phone control testing. The current lane parity checks are not a claim that steering is implemented. Keep continuous catch surfaces and recoverable main routes beneath optional risky jumps. Proposed steering API and opt-in fallback are recorded with the phone gameplay task for the next integrated pass.
