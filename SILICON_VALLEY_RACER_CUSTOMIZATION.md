# Doodle Derby — Silicon Valley racer customization

Prepared September 8, 2026. This is the concrete recommended v1 roster and garage specification, based on the user's request to finalize customization choices. It has not yet been implemented or numerically balanced. “Silicon Valley racer” describes the tone; the existing Doodle Derby name remains.

## Product decision

Build an absurd SF soapbox racer by choosing **one chassis, one set of four wheels, and one optional gadget**. Let the player see each part attach to the same vehicle. Put front-to-back wheelbase tuning and cosmetic choices beneath those three primary decisions.

Keep gravity-driven racing and the existing **hold to charge, release to hop** control. Gadgets respond automatically to that control or the vehicle's flight state. Neighborhood kits are editable starting builds, with no hidden set bonuses.

The tone is local SF objects assembled with startup confidence: a burrito carrying an AI billboard, an expensive Victorian porch on tiny skate wheels, and a driverless pod controlled from somebody's phone. Use readable object names alongside jokes. Keep racing labels literal: Chassis, Wheels, Gadget, Bolts, Ready.

## What the linked work already established

- **Build Doodle Derby prototype**: a playable 3D gravity racer with twelve household bodies, three wheel sets, front-to-back wheelbase settings, a ten-bolt budget, two players, three heats, and SF scenery. Its current task is integrating a shared race screen with individual phone garages/controllers.
- **Explore Tiny SF implementation**: the user selected Roman Klco's Isometric Cities reference for Doodle Derby. The task is producing Blender models and integrating them into Three.js; the local workshop contains Toast Malone, one Painted Lady, and a street wheel. These remain useful production tests.
- **Generate SF game art assets**: six original raster concept sheets have been imported into `reference-art/sf-derby/`. They cover the city, neighborhoods, chassis, wheels, gadgets, and hazards. These guide new models and selection art; they do not themselves supply animated 3D parts.

The existing data model already separates `bodyId`, `wheelId`, and `wheelbase`. The perception problem comes partly from presenting household-object thumbnails with fixed wheels and a dense catalogue of whole rides. The new garage must make assembly visible.

## Primary choices: six SF chassis

These are the six featured chassis for the new SF shelf. Preserve the existing twelve rides as Classics during rollout rather than deleting working choices or repurposing their IDs. The toaster study remains valid.

| Stable proposed ID | Object / display name | Intended handling identity | Intended drawback | Starting cost |
|---|---|---|---|---:|
| `sourdough` | Sourdough loaf / **Sourdough Starter** | Compact, light, lively hops | More sensitive to overcharging and hard landings | 2 |
| `mission_burrito` | Mission burrito / **Mission Missile** | Long and low, composed pitch | Long underside can scrape sharp crests; more mass to lift | 3 |
| `crab_pot` | Crab-pot cage / **Crab Cab** | Squat, broad footprint, forgiving landing target | Heavier than its open cage suggests | 3 |
| `painted_porch` | Victorian porch / **Rent Controlled** | Broad platform with a deliberately tall canopy | Higher center of mass makes bad landings lively | 3 |
| `cable_bench` | Cable-car bench / **Off the Rails** | Long, broad, heavy cruiser | Smaller hops for the same charge | 3 |
| `driverless_pod` | Driverless pod / **Public Beta** | Compact, moderate weight, low center of mass | Costs more than the simple starter | 4 |

These traits are design targets, not tested performance claims. The pod follows exactly the same player inputs as every other chassis. The cable-car bench accepts any wheels; its name does not imply rail locking. Crumb, cage gaps, and foil details are visual; collision envelopes must be straightforward and honest.

## Primary choices: three wheel sets

All chassis accept the same three sets. Prices cover four wheels. Keep the wheel mesh and axle/hub attachments separate from the chassis.

| Proposed ID | Choice | Intended role | Intended drawback | Starting cost |
|---|---|---|---|---:|
| `skate` | **Skate-Park Wheels** | Small, light, cheapest | Less clearance over rough ground | 2 |
| `scooter` | **Scooter Wheels** | Medium rubber wheels; approachable all-rounder | Neither the lightest nor highest-clearance choice | 3 |
| `transit_disc` | **BART Discs** | Larger transit-inspired discs; more clearance | Added mass and raised chassis change hop/landing behavior | 4 |

Skate and BART concepts are in the imported wheel sheet. Scooter wheels are a new production brief, using the existing street-wheel model as a starting point. All physical tuning remains to be measured; do not infer downhill speed from wheel size alone.

Soft-serve wheel appearances are reserved for a later cosmetic variant with a circular rolling envelope. Melting grip and actual rail-constrained contact require additional systems and are outside this v1.

## Primary choices: one gadget slot

Offer **Bare Bones** (no gadget, zero bolts), plus these three attachments. A gadget must have a visible mount, a readable effect, and a cost or drawback. No extra phone button is required.

| Proposed ID | Gadget | Automatic behavior to implement | Tradeoff | Starting cost |
|---|---|---|---|---:|
| `fortune_airbrake` | **Fortune-Cookie Airbrake** | Opens during airborne descent; adds drag that softens the approach to landing | Gives up forward distance/speed; the fortune text has no gameplay effect | 2 |
| `crissy_kite` | **Crissy Field Kite** | Unfurls after a hop and supplies bounded lift while airborne | Longer airtime makes precise landing timing harder; adds drag and cannot generate unlimited flight | 3 |
| `ai_billboard` | **AI Billboard Thruster** | A near-full grounded charge triggers one short forward pulse on hop release | Added weight and a more aggressive landing; partial-charge hops get no pulse | 3 |

These are new simulation features. The imported images depict their appearance, not functioning physics. Choose and test exact thresholds, forces, durations, cooldown/rearm rules, and mass before exposing authoritative stat claims. Prevent gadget activation during recovery, countdown, disconnection, or after finishing. Cancelled holds do not launch or fire a thruster. Trigger and show the effect from the shared simulation state, identically for both players.

The billboard can flash a canned joke such as “Now with AI” on its own surface. It must not cover the course or pause racing. Keep the cookie's fortune and any sponsor text deterministic or cosmetic; they never decide a winner.

## Tuning and appearance

**Wheelbase — front to back:** Compact / Regular / Stretched. Use the existing three choices and costs 0 / 1 / 2. This changes the distance between front and rear axles. It is not a left/right stance control; do not label it “wide” or claim it lowers roll risk. Keep Regular as the default.

**Look:** choose a curated paint accent, racing number, and one sticker. Suggested sticker set: “Public Beta,” “Pre-Revenue,” “Now with AI,” and “Rent Controlled.” Preserve blue/coral player flags and a clear player number regardless of paint. Cosmetic choices have zero bolt cost and zero physics effect.

The sea-lion horn belongs with appearance/audio. It can bark on a finish or clean landing without consuming the performance gadget slot or requiring a new controller button. Let the game's sound setting silence it.

## Budget and editable starters

Retain **10 bolts per player**. Starting prices above are an initial budget proposal, not a completed balance pass. Keep no-gadget builds useful and affordable. Never silently swap another part when the player picks an expensive item; show its cost and a clear way to free bolts.

| Preset | Chassis | Wheels | Gadget | Wheelbase | Bolts |
|---|---|---|---|---|---:|
| **Wharf Starter** | Sourdough Starter | Scooter Wheels | Fortune-Cookie Airbrake | Regular | 8 |
| **Mission Launch** | Mission Missile | Skate-Park Wheels | Crissy Field Kite | Regular | 9 |
| **SoMa Demo Day** | Public Beta | Skate-Park Wheels | AI Billboard Thruster | Regular | 10 |
| **Rent Is Due** | Rent Controlled | Skate-Park Wheels | Fortune-Cookie Airbrake | Regular | 8 |
| **Pier Pressure** | Crab Cab | BART Discs | Bare Bones | Regular | 8 |
| **Off the Clock** | Off the Rails | Scooter Wheels | Bare Bones | Stretched | 8 |

Six chassis × three wheels × four gadget states (including none) gives **72 combinations before tuning and budget limits**, or 216 with three wheelbase settings. This is an authoring count, not a claim that every build is legal or competitively balanced.

## Garage flow

1. The player's phone opens on their current assembled vehicle and the six featured chassis. Show chassis-only thumbnails, with the object name and one short handling note.
2. Persistent steps read **Chassis · Wheels · Gadget · Look**. The current assembly, selected part names, remaining bolts, and Ready action stay visible.
3. Selecting a part visibly replaces that module on the preview. Wheel thumbnails show a wheel or wheel set; gadget thumbnails show an unattached gadget. Avoid complete preset-car artwork as a part-selection thumbnail.
4. A compact “Tune” disclosure contains Wheelbase — front to back. Avoid an initial wall of raw physical parameters. Add comparative stat bars only after deriving them from measured behavior.
5. A preset applies an editable combination. The big screen shows assembled racers, names, and readiness; each phone controls its own build. Any part edit clears that player's ready state.
6. After a heat, return to the same assembly and allow a clear one-part revision. Keep race results available so players can judge the next run.

## City and race personality

Carry the selected diorama language into the actual 3D assets: compact readable silhouettes, beveled edges, coordinated cream/cobalt/coral/mint palette, warm lighting, and modest detail. Some imported sheets are more textured than the current Blender study; simplify foil, bread, and wood detail to match the tested in-game style.

Use the neighborhood sheet as five environment kits: Wharf, Chinatown, Mission, Marina, and SoMa. The existing short course remains a compressed SF collage. Do not imply its landmarks are geographically ordered or that it already contains a drivable Lombard switchback.

Place tech shuttles, startup billboards, coffee culture, and driverless-pod jokes throughout that city. Pair these with actual SF objects and recognizable neighborhood architecture. Spectators and peaceful marchers remain track-side characters. New hazards that players cannot steer around need a fair, clearly telegraphed hop solution in both lanes.

## Production and integration handoff

Create chassis, wheels, and gadgets as separate Blender/GLB modules using the existing working asset pipeline. Give every chassis a documented origin, forward direction, wheel centers, driver seat, and gadget mount. Validate dimensions from both the showroom and chase camera. The large porch canopy and pod lidar must not overlap gadget mounts or hide upcoming obstacles.

During implementation, extend the complete Blueprint contract together: catalogue, defaults, budget calculation, validation, phone/server message handling, phone build equality, snapshots, save/restore behavior, and renderers. The current server reconstructs a three-field blueprint, so simply adding a gadget control would drop data. Preserve old IDs and normalize older builds to no gadget plus default cosmetics.

Keep wheelbase positions shared between preview and physics. Each new chassis needs a matching collider envelope. Define gadget forces in the simulation rather than adding visual-only speed claims. Recheck input cancellation and reconnect behavior against the ongoing phone-controller work.

Build in this order: (1) modular garage using existing working parts, (2) representative SF chassis and matching wheel modules, (3) the full six-chassis shelf, (4) one gadget at a time, (5) measured budget/balance and sound polish. Preserve the current playable game throughout rollout.

Acceptance requires legal starters that finish the course, distinguishable tradeoffs, parity between both lanes, several input patterns rather than one tuned script, no dominant always-full-charge gadget, legible phone selection, ready-state reset on edits, and visible part changes in the actual race. Existing tests cover the old roster; they do not validate this new roster.

## Sources

- [Imported art index](reference-art/sf-derby/README.md) and [source manifest](reference-art/sf-derby/sources.json).
- [Shared art task — Generate SF game art assets](https://chatgpt.com/s/cx_6aa06772bee081919c2e91c464c97f82).
- [Build Doodle Derby prototype](thread://01a0825e-2ccf-77d3-b6a9-0fbf066542c1?hostId=local), read during this task.
- [Explore Tiny SF implementation](thread://01a08277-7222-7db3-9ebe-4f809fc91ccd?hostId=local), read during this task.
- Existing local references: `doodle-derby/ART_DIRECTION.md`, `doodle-derby/game/catalogue.ts`, `doodle-derby/game/types.ts`, `doodle-derby/game/physics.ts`, `doodle-derby/components/DerbyUI.tsx`, and `doodle-derby/components/PhoneController.tsx`.
