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

## Phone party

The published site is public. Anyone with its link can play; no sign-in is required.

1. Open the game on the shared computer/TV and choose **Play with phones**.
2. Create a room. Each player scans its QR code, or opens `/play` and enters the six-character code.
3. Pick parts on each phone and tap **Ready to roll**. Start the heat on the shared screen.
4. Hold the large phone button to charge; release to hop. Race views and scoring stay on the shared screen.

Rooms support two phones and expire after two hours. Keep the shared screen open. A dropped controller pauses the simulation, and returning to the same phone tab restores its player slot. Ending a phone party returns to keyboard mode. Refreshing the shared screen requires a new room.

The shared browser is authoritative for physics and outcomes. WebRTC carries input directly when possible, with a server relay fallback when direct connectivity is unavailable. Relay controls can respond more slowly; real-device latency needs broader playtesting. Phones display individual garage, charge, progress and results without running a second 3D simulation.

## Run locally

Requires Node 22.13 or newer.

```sh
npm install
npm run dev
```

Open the local address printed by the server. Phone rooms also require the local D1 migration (the published site applies it automatically). After building, run `npx wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_abnormal_black_tarantula.sql`. For actual phones, use the published HTTPS URL.

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

This is an early playable milestone. The road follows simple contained lanes; Lombard is visual inspiration, not a geographically accurate winding driving route. There is no free steering, independent remote race view, vehicle-to-vehicle collision, or detailed destruction. Phone-party mode uses one shared race screen.

Live Astra integration, validated accept/restore revisions, persistent build history, and deeper tuning remain for the next iteration. Local tips do not call a model. No API key is needed for this version.

The repeatable physics checks exercise control rules, recovery, lane fairness, and representative timed runs. They support preliminary tuning, not a claim of comprehensive competitive balance or human-tested difficulty for every combination.

## Code ownership

`game/physics.ts` owns simulation, `game/track.ts` owns shared terrain geometry, `game/catalogue.ts` owns build definitions and validation, `game/visuals.ts` owns models and scenery, `game/renderer.ts` owns cameras/rendering, and `components/DoodleDerby.tsx` owns the session and input integration. `components/DerbyUI.tsx` provides the garage and race screens.
