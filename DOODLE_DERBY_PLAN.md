# Doodle Derby — proposed build checklist

Status: first playable milestone implemented in this repository. The user authorized a 30-minute basic version, with real 3D physics, parallel implementation, a large roster, and SF-inspired landmarks. See `PLAYABLE_MILESTONE.md` for the current build and remaining work. The longer five-hour milestones below remain the roadmap.

The demo should be fun to play and visibly demonstrate capable 3D simulation. A substantial selectable roster and balanced mechanics are now explicit user requirements. Astra's pit advice should support the game. The original brief remains the baseline except for the proposed changes and clarifications below.

**Scope to align on**

| Decision | Proposed first version |
| --- | --- |
| Simulation | Real 3D vehicle physics: gravity, wheel contacts, jumps, landings, pitch, roll, and recoverable tumbles. |
| Driving | Keep one-button charging and hopping. Use a mostly straight downhill course with containing boundaries. Steering remains the main unresolved scope choice. |
| Multiplayer | Two local human players on one keyboard, F and J. Two large touch controls where practical. Separate identical lanes, with no vehicle-to-vehicle collision. |
| Camera | Stable split view so each player can always see their own vehicle and next obstacle. |
| Course | One SF/Soapbox-inspired course targeting 30–45 seconds: Lombard-inspired bumps and gardens, a Golden Gate gap/bridge, a mildly tilted landing, and a final kicker toward the bay skyline. Include recovery space between hazards. The basic course uses contained straight lanes. |
| Garage | Proposed target: 12 recognizable bodies grouped into four handling families, three wheel types, and three permitted front-to-back wheel-spacing settings. Four-wheel builds with fixed lateral wheel spacing per body initially. Exact roster count remains a proposal. |
| Balance | Every body must have an affordable, playable configuration. Every handling family should offer a useful, observable tradeoff. Timed hopping should matter; no build or simple input exploit should obviously dominate the course. Balance is tested throughout implementation. |
| Budget | Proposed clarification: ten bolts per player, with the same catalogue and prices. Every body has an affordable playable build. |
| Session | Garage → reveal → countdown → race → results/pit stop → next heat; three heats, standings, and quick rematch. |
| Astra | One evidence-grounded, validated revision per player between heats. Keep/accept/restore choices. Explicitly labeled local suggestions if live integration is unavailable. |
| Presentation | Colorful street-fair setting, recognizable household vehicles, simple ramps, hay bales, painted signs, clear player colors, responsive charge feedback and lightweight sound. |
| Deferred | Online play, phone controllers, AI drivers, freehand drawing, complex destruction, track editor, replays, extra courses, and fluid simulation. |

**Work packages**

| ID | Work | Owner | Depends on | Observable completion |
| --- | --- | --- | --- | --- |
| 0 | Create the runnable foundation and shared data definitions. Establish file ownership and minimal fixtures. Check the configured AI integration route early. | Lead | Scope alignment | Browser opens a test scene. Specialists can run their own pieces against the same blueprint, course, and event formats. AI availability and actual configured model identity are recorded without exposing secrets. |
| 1 | Vehicle physics and hop control: bodies, wheels, mounting, mass, grounded detection, capped charge, launch, and recovery. | Physics agent | 0 | A vehicle rolls, hops, lands, and resets consistently. Two builds differ through physical parameters. No airborne charging, double jump, or accidental launch on focus loss. |
| 2 | Track and visual scene: build the blockout first, then readable obstacles, vehicle models, lighting, boundaries, and simple scenery. | Track/visuals agent | 0 | The five course sections exist. Visible terrain matches collision geometry. Vehicles remain recognizable at gameplay scale. |
| 2a | Roster design and balance: define handling families, bounded physical profiles, costs, viable starter builds, and repeatable comparison scenarios. Build four representative bodies first, then expand to the proposed 12. | Physics/balance agent owns tuning; track/visuals agent owns models | 0; compare once 1 runs | Every body has a legal starter build. Representative families pass obstacle, coasting, charge-spam, and player-slot fairness checks. Shared behavior is described honestly. |
| 3 | Garage and session flow: grouped roster, costs, legal mounts, previews, starter builds, track preview, readiness, countdown, results, three heats, standings, history, and rematch. | Garage/flow agent | 0 and catalogue IDs; can use fixture results | Both players can quickly choose legal builds, understand their main tradeoff, and complete the entire screen flow using sample results before physics integration. |
| 4 | Connect local multiplayer, input, rendering, cameras, timing, scoring, and checkpoints. Continuously playtest. | Lead | Incremental deliveries from 1–3 | Two players independently and simultaneously control a race. Both views remain readable; finish, timeout, and recovery produce correct results. |
| 5 | Astra pit engineer: evidence summary, server-side model call, structured response, one-change validation, failure handling, and local fallback. | Track/visuals agent after course delivery | 0 schemas; fixtures first, real telemetry later | Actual race evidence produces one legal proposal. Accept/keep/restore works. Invalid or failed responses never prevent the next heat. Live path is exercised when credentials are available. |
| 6 | Tune feel and clarity: spring response, obstacle difficulty, vehicle tradeoffs, impact effects, sound, opponent progress, and advice presentation. | Physics and garage/flow agents; lead validates | First integrated race; balance starts earlier in 2a | Players can understand a miss, deliberately improve timing, read the race standings, and notice useful build tradeoffs. |
| 7 | Full demo verification, fixes, startup instructions, and delivery. | Lead, with focused checks assigned to available agents | Complete session loop | A full three-heat session and rematch run in the browser; consequential checks pass and remaining limitations are documented. |

**How parallel work stays compatible**

- Use the session's four concurrent worker slots: one lead and three specialists. Reassign finished specialists to the next independent package.
- The lead owns project configuration, shared definitions, integration, and the playable entry point. Specialists own separate module areas and avoid editing each other's files.
- Establish common definitions for vehicle blueprints, catalogue constraints, course geometry and obstacle IDs, input state, simulation snapshots, race events/results, and advice responses before implementation branches out.
- Use one course definition for visible terrain and physical collision shapes. The track agent owns that definition; the physics agent consumes it.
- Keep one catalogue validator shared by the garage and Astra. Its cost and mounting rules must not be duplicated independently.
- The physics/balance owner maintains one tuning table for mass, geometry, mounting limits, wheel properties, spring parameters, and part costs. Garage, physics, and Astra consume the same catalogue data. Model geometry must stay consistent with the physical envelope; decorative details may be non-colliding when that is visually reasonable.
- Physics produces measured events; flow owns heat transitions and standings; the lead connects them. Rendering reflects simulation state and cannot decide race outcomes.
- Specialists use small fixtures to make progress while dependencies are being built. Integration begins with the first usable delivery, not at the end of each package.
- Check AI setup early, including the credential workflow and actual configured hackathon model identifier. Never assume the coding agent's model name is the API endpoint identifier.

**Milestones from implementation start**

| Target | Required playable state |
| --- | --- |
| First 15–20 minutes | Foundation, shared definitions, and independent assignments are ready; AI setup requirements identified. |
| By 60 minutes | One vehicle, one useful obstacle, visible charge, a satisfying physics-driven hop, safe recovery, and two contrasting build presets. Course, roster silhouettes, and garage work proceed alongside this. The spring/charge behavior is defined so balancing can start. |
| By 120 minutes | Two local players complete a short race with independent controls, readable cameras, reliable finishes/timeouts, and rematch. |
| By 180 minutes | Legal garage choices and all three heats work. Expand from four tested representative bodies toward the proposed 12-body roster. Family tradeoffs are visible; each included body has a viable starter configuration. |
| By 240 minutes | Pit advice, validated revisions, and history work with real race evidence; live AI is exercised if available. |
| Final 60 minutes | Tune, fix, and verify full sessions. Prioritize gameplay clarity and reliability. |

The first playtest is a decision point: if hopping and landing are confusing, focus physics and track work on that small section before expanding the course. If lateral motion causes uncontrollable failures, adjust physical containment and obstacle severity while keeping motion physically simulated.

**Proposed roster and selection experience**

Interpretation to align on: a big roster means many selectable silly vehicle bodies, plus a small number of meaningful part choices. It does not yet mean unrestricted assembly of arbitrary parts.

| Proposed family | Candidate bodies | Handling hypothesis to test |
| --- | --- | --- |
| Low and broad | Bathtub, sofa, dumpster | Broad support and a low center of mass may resist sideways tipping. Mass, dimensions, and cost must create an actual drawback. |
| Compact | Toaster, suitcase, lunchbox | A smaller, lighter build may hop more easily but need more careful charge selection. |
| Long and low | Canoe, banana, ironing board | Longer wheel spacing may resist forward/backward tipping while increasing the chance of scraping over a crest. |
| Tall | Shopping cart, fridge, arcade cabinet | Height makes lateral balance more demanding. Clearance, lighter configurations, or lower body cost must provide a reason to choose these builds. |

These are candidate objects and hypotheses, not tested traits. Reuse four rig families, simple geometric models, and bounded physical variations. Some bodies may share behavior; do not present twelve visual choices as twelve wholly distinct mechanics. Any visible difference that implies a meaningful collision change should match the collider envelope.

The proposed 12 bodies, three wheel types, and three wheelbase settings produce up to 108 combinations before budget and mounting restrictions. This is an authoring estimate, not a promise that every combination is legal or equally competitive. Every body needs at least one legal build capable of completing the track.

The selection screen should show a recognizable preview, family, price, remaining bolts, and one tested strength/weakness. Provide ready-to-race starter configurations and a quick view of upcoming obstacles. Body choice remains visible during wheel and spacing changes. Avoid forcing players to understand raw physics parameters before racing.

**Balance rules and checks**

- Define the charge-to-hop rule before tuning mass. Choose and document whether charge represents stored energy or impulse, the cap, launch direction, and grounded-contact rules. Do not equalize all vehicle jumps with hidden assistance while claiming weight matters.
- Balance targets are useful tradeoffs and viable choices. Identical finish times across every build are not a requirement; arbitrary poor combinations need not be equally competitive, but avoid presenting a legal starter as a hopeless option.
- Price desirable combinations so the bolt budget creates an understandable choice. Check for parts that are always better at the same or lower cost.
- Test obstacle-specific behavior as well as whole-race time: clearance over bumps, stability on landing, recovery frequency, and controllability. A build that is repeatedly both faster and safer with no meaningful cost is a tuning flag.
- Compare no-input coasting, rapid tapping, repeated maximum-charge hops, and obstacle-timed jumps. Deliberate timing should offer an advantage; maximum charge should not automatically be best everywhere.
- Use repeatable input patterns for controlled comparisons and several patterns to avoid balancing to one script. Follow those checks with actual human playtesting. Test helpers are development tools, not AI opponents or predetermined race outcomes.
- Test identical builds with identical inputs in both player slots, accounting for translated lane position. Starts, terrain, charge timing, recovery, and results should be symmetric within measured simulation tolerance.
- Keep the track unchanged across three heats. Include recovery straights so one mistake does not become an unavoidable chain of crashes.
- Balance remains preliminary until measured and playtested. Automated comparisons can expose obvious problems but cannot prove the game is fun or comprehensively balanced.

**Design details still missing from the initial brief**

1. Resolve steering versus one-button hopping. This determines allowable lateral hazards, containment, and the relevance of track width.
2. Confirm roster size and whether variety means many bodies with shared families or many independently tuned vehicle types.
3. Define the charge/launch physical model and exactly when a vehicle counts as grounded, especially when only one wheel touches a bump.
4. Define the budget's tradeoffs and starter builds before filling the catalogue.
5. Make course obstacles and body strengths readable before selection and during racing; include clear charging, airborne, and recovery states.
6. Finalize points, ties, race timeout, checkpoint safety, recovery delay, and permitted between-heat edits. Provisional defaults: 3/1 heat points, equal points for ties, a 60-second race timeout, and a 2-second recovery after a crash/stranding is detected, with the race clock continuing. Exact ties share a placing; do not break them by player index. Race results still follow the original finisher/progress ordering.
7. Support party-game pacing: quick selection, clear readiness, a shared countdown, opponent progress, readable penalties, immediate rematch, and impact/landing sounds. Effects must not hide upcoming hazards.
8. Validate stability and responsiveness with two active 3D views and the complete roster on the demo machine. Reduce decorative complexity when rendering harms input or physics consistency.

These details are proposals for alignment, not additional approved implementation scope. Roster models and physics tuning are an added workload: if the five-hour window remains fixed, use simple reusable geometry and prioritize representative balance checks over elaborate art or new customization dimensions.

**Completion checklist**

- [ ] Two players can charge and release independently and simultaneously.
- [ ] Charge caps correctly, clears after launch/recovery, and cannot accumulate in midair.
- [ ] Focus loss clears inputs without launching or leaving controls stuck.
- [ ] Different legal builds have noticeable physical differences; a heavy body is not simply declared more stable without testing.
- [ ] The agreed roster is selectable, recognizable, and organized by understandable handling families.
- [ ] Every included body has a legal, completable starter build; plainly shared handling is labeled honestly.
- [ ] No obvious dominant build, universally superior wheel choice, or maximum-charge/rapid-tap exploit emerges from representative comparisons.
- [ ] Timed hopping offers a useful advantage over passive coasting without making the opening section confusing.
- [ ] Identical builds and inputs behave fairly in either player slot.
- [ ] Course geometry, collision shapes, and checkpoint positions agree.
- [ ] Recovery preserves the chosen build, returns to a prior safe checkpoint, clears charge, and costs time without granting progress.
- [ ] Finishers rank by elapsed time. Unfinished vehicles rank behind finishers by valid progress. Three-heat points are visible.
- [ ] Both players can see their vehicle and the next obstacle throughout a race.
- [ ] Garage and advice obey identical budgets and mount constraints.
- [ ] Advice distinguishes observations from hypotheses and proposes exactly one legal revision.
- [ ] Failed, delayed, or invalid AI responses leave the game playable. Local suggestions are labeled.
- [ ] Previous builds and results remain available, including the best recorded build. Faster human runs are not presented as causal proof of an improved design.
- [ ] A full three-heat session, restore action, and rematch complete in the browser.
- [ ] Live AI path is tested if credentials are available; integration status is reported honestly.
- [ ] Startup instructions and unfinished items are documented.

If time slips, simplify scenery, model detail, and optional effects first. Preserve the requested broad roster through reusable rigs and simple silhouettes. Any reduction to the agreed roster size or core mechanics should be raised as a visible scope tradeoff. Keep the same playable track across heats to give players a chance to learn it.
