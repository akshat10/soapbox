# Powered Bay or Bust circuit

The local session enables `{course:'bay-or-bust', steeringEnabled:true, circuit:true, arcade:true, laps:3}`. Omitting circuit/arcade preserves the original downhill simulation. Phone parties retain the classic course. The session owns the 240-second heat limit and three-lap HUD.

## Geometry and racing

- The 431.54m authored road joins a continuous western coastal viaduct, making a 772.65m circuit. Rendering and collision use the same sampled ribbon. Joins preserve position and heading; the return's minimum corner radius is about 26.6m.
- `courseForSnapshot(snapshot)` selects the geometry. `lookFrame()` wraps camera/throttle/AI lookahead across the seam; `frame()` and `project()` retain bounded physical projection.
- Three ordered route checkpoints precede each lap crossing. A new lap preserves physical position and velocity, resets pad/ring eligibility, and keeps cumulative reward counts. Recovery cannot grant progress. The complete winning pose and lap timer freeze after finishing.
- The finish arch and start checker paint move to the circuit seam. Old finish paint is hidden. `CourseScene.setCircuit(false)` restores the authored open-course layout. Two scenery objects intersecting the return are hidden only for circuit presentation.

## Driving and rewards

- Automatic drive targets 23m/s (83km/h) on straights, with an 8.5m/s cap through the bumpy opening and lower entry speeds for crests, jumps and tight turns. A bounded boost can approach 30m/s. Shared rules apply to player and AI.
- Acceleration is along the car's heading. Ground grip and player-directed airborne yaw improve control without following a road centreline for the player.
- Optional pads at 252–258m and 372–378m give real impulses, once per lap. The tested starter gains 6.00m/s and about 4.42m/s. A pad at its safe speed cap does not emit a false boost event.
- Rough lanes at 64–72m and 303–311m slow grounded tires. Hopping or steering around them preserves momentum.
- Two ring openings per lap use swept airborne crossing detection. The first opening is 3.2m radius for the powered circuit and 2.25m for the original course; sensor and artwork scale together.

## Validation

- `node --import tsx game/circuit-check.ts`: three laps, four racers, 120Hz analog and 30Hz binary human steering; all eight runs finish in 145–148s with zero recoveries. Verifies connected geometry, lap transitions, pause/reset, frozen finish and relocation rejection.
- `node --import tsx game/circuit-rewards-check.ts`: two laps, both boost lanes and both rings on each lap; four positive impulses, four rings, zero recoveries, about 98.52s.
- `node --import tsx game/course-features-check.ts`: original-course pads, cap/no retrigger, rough/smooth/hop alternatives and reachable rings for three builds.
- `node --import tsx game/physics-check.ts`: classic controls, recovery, fairness and all 15 starter bodies.
- Actual GLB geometry was loaded headlessly to verify the single relocated finish arch and all 56 checker tiles (28 moved, 28 hidden).
- TypeScript, focused lint and production build pass. These checks do not substitute for human driving or device performance testing.

Track Design and the solo UI task are integrating the final homepage/HUD presentation. The release owner controls the final combined build and publication.
