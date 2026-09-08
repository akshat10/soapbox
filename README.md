# Silicon Racer · Doodle Derby

A playable 3D soapbox party game on a San Francisco-inspired downhill course. Two to four players race on their own phones while a shared computer/TV runs the simulation and shows every racer. A two-player keyboard mode is also available.

[Play Silicon Racer](https://doodle-derby-akshat.quiteparticular.chatgpt.site) · [Source repository](https://github.com/akshat10/soapbox)

## Play

Choose an SF original (sourdough loaf, Mission burrito, or Victorian porch) or a classic household ride. Choose wheels and axle spacing within a ten-bolt budget.

- Player 1: hold **F** to charge, release to hop.
- Player 2: hold **J** to charge, release to hop.
- Touch/mouse: hold and release the corresponding colored control.
- Charge only builds while wheels are grounded. It caps after 0.8 seconds.
- Gravity drives the vehicle. Lanes constrain sideways movement and steering; pitch, roll, suspension, jumps, collisions, and landings use a real 3D physics simulation.
- At the Golden Gate gap, begin holding near the HOLD marking and release over the HOP marking before the edge.
- After a tumble, the crew rights the car just behind the crash and restores its last measured safe momentum. A missed gap has a slower roll-through route. Holding the hop button through recovery keeps the gesture active; canceling still clears it.
- Three heats, with build changes between them. Placements earn 5, 3, 2, and 1 points; ties share the points for the occupied places. Unfinished vehicles rank behind finishers by current valid course progress when the 60-second limit or the visible 12-second finish window after the leader expires.

## Phone party

The published site is public. Anyone with its link can play; no sign-in is required.

1. Open the game on the shared computer/TV and choose **Start**.
2. Each player scans the room's QR code, or chooses **Join a race** on their phone and enters the six-character code.
3. Pick parts on each phone and ready up. With at least two joined drivers, the race starts automatically once all joined drivers are ready.
4. Each phone shows its own live 3D chase view. Hold the thumb button to charge; release to hop. The big screen shows all racers for spectators.
5. After a short podium, the next garage opens automatically. Ready up on the phones for the next heat, or for a rematch after the championship.

Rooms support four phones and expire after two hours. Keep the shared screen open. A dropped controller pauses the simulation, and returning to the same phone tab restores its player slot. Ending a phone party returns to keyboard mode. Refreshing the shared screen requires a new room.

The shared browser is authoritative for physics and outcomes. WebRTC sends inputs and full car/wheel poses directly when available (up to 30 updates per second). An HTTP relay provides a fallback, with ordered input sequence numbers preventing duplicate hops during handovers. Phones interpolate received poses, use a capped rendering resolution and omit expensive real-time shadows. Relay latency and actual device performance still need broader playtesting. Late joiners enter the next heat. The spectator screen must remain open and visible; this version does not run physics on a background server.

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

- Three authored SF chassis and twelve classic household rides.
- Three authored SF wheel sets plus classic wheels, constrained spacing, and shared cost/legality validation.
- Independent local controls and split cameras, countdown, finish/timeouts, three heats, standings, and rematch.
- SF-inspired scenery: a Golden Gate bridge segment, Lombard-inspired flower and brick landscaping, Painted Ladies, Coit Tower, and Transamerica skyline.
- Cannon rigid-body physics with raycast suspension, mass-aware spring hops, recoveries, and measured race events.
- Local pit tips clearly labeled as local suggestions.

## Current limits

This is an early playable milestone. Short takeoff grace and landing-release buffering make timing more forgiving. The road follows simple contained lanes; Lombard is visual inspiration, not a geographically accurate winding driving route. There is no free steering, vehicle-to-vehicle collision, or detailed destruction. Phones have their own race views; the spectator browser remains the required race host.

Live Astra integration, validated accept/restore revisions, persistent build history, and deeper tuning remain for the next iteration. Local tips do not call a model. No API key is needed for this version.

The repeatable physics checks exercise control rules, recovery, lane fairness, and representative timed runs. They support preliminary tuning, not a claim of comprehensive competitive balance or human-tested difficulty for every combination.

## Code ownership

`game/physics.ts` owns simulation, `game/track.ts` owns shared terrain geometry, `game/catalogue.ts` owns build definitions and validation, `game/visuals.ts` owns models and scenery, `game/renderer.ts` owns cameras/rendering, and `components/DoodleDerby.tsx` owns the session and input integration. `components/DerbyUI.tsx` provides the garage and race screens.

## Project materials

- `app/`, `components/`, `game/`, `lib/`, and `db/`: playable game, phone controllers, room service, and simulation.
- `drizzle/`: versioned room-database migrations.
- `public/models/`: the 3D models loaded by the game.
- [Asset workshop](asset-workshop/README.md): Blender generation scripts, editable `.blend` source, exports, and the rendered study.
- [SF concept art](reference-art/sf-derby/README.md): six original reference sheets and their source manifest.
- [Build plan](DOODLE_DERBY_PLAN.md) and [implemented milestones](PLAYABLE_MILESTONE.md).
- [Art direction](ART_DIRECTION.md), [visual checks](design-qa.md), and [proposed SF customization](SILICON_VALLEY_RACER_CUSTOMIZATION.md).

Proposed features in the planning documents are not necessarily implemented. The current playable features and limitations are described above.

Room API regression checks: `node --import tsx game/party-check.ts` (Node 24 recommended for the built-in SQLite test fixture).

Four-player checks: `node --import tsx game/race-check.ts`, `node --import tsx game/party-input-check.ts`. These exercise four-lane fairness, sparse slots, tap handling, placements/ties, complete pose transmission, readiness across heats, and connection handovers.
