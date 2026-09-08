# Doodle Derby

A playable first prototype of a local two-player 3D Soapbox party game, set on a San Francisco-inspired downhill course.

## Play

Choose one of 12 household vehicles, one of three wheel sets, and a wheelbase within a ten-bolt budget. Start the race together.

- Player 1: hold **F** to charge, release to hop.
- Player 2: hold **J** to charge, release to hop.
- Touch/mouse: hold and release the corresponding colored control.
- Charge only builds while wheels are grounded. It caps after 0.8 seconds.
- Gravity drives the vehicle. Lanes constrain sideways movement and steering; pitch, roll, suspension, jumps, collisions, and landings use a real 3D physics simulation.
- At the Golden Gate gap, begin holding near the HOLD marking and release over the HOP marking before the edge.
- Recoveries return to the last safe checkpoint, including its recorded forward velocity. Time continues; recovery never moves the vehicle ahead of that checkpoint.
- Three heats, with build changes between them. A heat win earns 3 points, second earns 1; equal results earn 2 each. Unfinished vehicles rank behind finishers by current valid course progress at the 60-second timeout.

## Run locally

Requires Node 22.13 or newer.

```sh
npm install
npm run dev
```

Open the local address printed by the server, normally http://localhost:3000/.

```sh
npm run build
node --import tsx game/physics-check.ts
npx tsc --noEmit
```

On machines with an incompatible globally installed libvips, install with `SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install`.

## Included in this first milestone

- 12 recognizable 3D bodies across four handling families.
- Three wheel types, constrained spacing, and a shared cost/legality catalogue.
- Independent local controls and split cameras, countdown, finish/timeouts, three heats, standings, and rematch.
- SF-inspired scenery: a Golden Gate bridge segment, Lombard-inspired flower and brick landscaping, Painted Ladies, Coit Tower, and Transamerica skyline.
- Cannon rigid-body physics with raycast suspension, mass-aware spring hops, recoveries, and measured race events.
- Local pit tips clearly labeled as local suggestions.

## Current limits

This is an early playable milestone. The road follows simple contained lanes; Lombard is visual inspiration, not a geographically accurate winding driving route. There is no free steering, online multiplayer, vehicle-to-vehicle collision, or detailed destruction.

Live Astra integration, validated accept/restore revisions, persistent build history, and deeper tuning remain for the next iteration. Local tips do not call a model. No API key is needed for this version.

The repeatable physics checks exercise control rules, recovery, lane fairness, and representative timed runs. They support preliminary tuning, not a claim of comprehensive competitive balance or human-tested difficulty for every combination.

## Code ownership

`game/physics.ts` owns simulation, `game/track.ts` owns shared terrain geometry, `game/catalogue.ts` owns build definitions and validation, `game/visuals.ts` owns models and scenery, `game/renderer.ts` owns cameras/rendering, and `components/DoodleDerby.tsx` owns the session and input integration. `components/DerbyUI.tsx` provides the garage and race screens.
