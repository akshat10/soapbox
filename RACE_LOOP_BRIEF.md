# Silicon Racer — a race with continuous choices

September 8, 2026. Research and proposed next pass; these mechanics are not all implemented. The reference is Mario Kart Tour on iPhone. This review used Nintendo's help pages, Apple's gameplay guides, and the official App Store preview. It is not a hands-on test of the native iPhone game.

## What the reference teaches

Mario Kart Tour makes steering and drifting available throughout the race, with different touch layouts and driving assistance. Its landscape controls can separate steering and items between the two sides of the screen. [Nintendo: control settings](https://faq.mariokarttour.com/hc/en-us/articles/4409330910233-Can-I-change-the-controls), [iOS landscape controls](https://faq.mariokarttour.com/hc/en-us/articles/4409338507417--iOS-How-do-the-controls-work-in-Landscape-mode).

Drifts build visible sparks and release into boosts. Pickups, jumps and item use give players actions to chain together. This creates opportunities while entering a corner, traveling along a straight, and approaching another racer. [Apple: gameplay guide](https://apps.apple.com/us/iphone/story/id1533872240), [Nintendo: combos](https://faq.mariokarttour.com/hc/en-us/articles/4409410756761-How-do-combos-work).

Item availability depends partly on race position and other race conditions. The useful lesson for our party game is that trailing players should still have decisions worth making. [Nintendo: item rules](https://faq.mariokarttour.com/hc/en-us/articles/4409411636889-How-do-items-work).

Our inference: the engagement comes from choosing lines, timing actions and responding to changing opportunities. More buttons or visual effects alone do not create those decisions.

## Current baseline

The released fixed-lane physics provides occasional hop timing but no steering, drift reward, pickups or held items. A controlled single-racer simulation using Sourdough / Scooter / Standard at 120 updates per second produced:

| Input pattern | Finish | Hops | Recoveries |
|---|---:|---:|---:|
| Hold at Z 74–83.5 and 213–226; release outside those windows | 33.55 seconds | 2 | 0 |
| No input | 35.58 seconds | 0 | 1 |

The successful timed pattern began its first hold at approximately 16.26 seconds and held the control for only 2.14 seconds in total. This is one repeatable pattern, not a claim that earlier hops cannot help or a substitute for human testing. Physics, catalogue and track matched release commit `f3d5ecb206874b051fd38ef07164750c9d8ae0d4` at measurement time. The existing UI prompts the first release slightly earlier, at Z 81.5.

This small hands-off penalty explains the weak sense of agency. Preserve forgiving recovery, while adding useful driving choices from the opening seconds.

## Build order

1. **Smooth phone motion and responsive steering.** Fix the reported iPhone Safari choppiness before adding workload. Complete the physical steering and curving-course integration already underway. Evaluate touch response on an actual iPhone with the laptop hosting; desktop browser tests cannot certify device feel.
2. **Choose a line and earn a short boost.** Place occasional boost pads on an exposed line and pickups on a wider line. Reward a clean landing once per jump feature. Keep an accessible safe route. This gives steering and hopping a purpose immediately, before inventory is needed.
3. **Make corners rewarding through drift.** Controlled cornering builds a visible meter; exiting the drift gives a short boost. Require actual forward progress through a turn so wiggling the controls cannot farm rewards. Start with one boost tier.
4. **Add one held item.** Start with an Espresso Boost: use it now to catch someone or save it for a straight or shortcut. One slot, fixed pickup positions, readable ready state, exactly-once use. Defensive and offensive items can follow after driving feels good.

Target a consequential opportunity every 2–4 seconds, with occasional 1–2-second breathing spaces. These are proposed pacing targets, not measured Mario Kart timings. Keep race position as the winner criterion; action rewards should help the race, without replacing it with a separate points competition.

## Phone controls

Recommended default: two thumbs, automatic forward motion. Left thumb drags horizontally to steer. Right thumb holds and releases Hop. A separate, fixed item button sits above Hop once items exist. Steering gestures must never accidentally launch a hop or spend an item. Landscape preserves the same left/right arrangement; support mirrored controls.

Use a transparent steering touch area, a compact Hop button with its charge ring, and a small item control. Leave the road and car visible. Show local touch feedback immediately; show earned charge, boosts and item effects from authoritative game state. Visual and audio feedback must work without vibration.

Each touch has independent ownership. Lifting the steering thumb centers steering; lifting Hop releases only the hop. Losing focus, pausing or rotating safely cancels all gestures. A healthy network-route change must preserve a held gesture. A one-handed option would require assisted hopping or steering and should be designed separately.

## A proposed 30-second sequence

| Time | Choice |
|---|---|
| 0–3 seconds | Steer into the first bend and choose a line. |
| 3–6 | Take the inside line or go wider for a pickup. |
| 6–9 | Charge a hop while lining up a curb or ramp. |
| 9–12 | Land cleanly, earn a brief boost and correct the line. |
| 12–15 | Spend a held boost or save it for the next straight. |
| 15–19 | Link Lombard-style direction changes and build a drift reward. |
| 19–23 | Move past a rival or reach the next pickup. |
| 23–27 | Commit to a physically validated shortcut and steer the landing. |
| 27–30 | Time the final boost and choose the finish line. |

This is an illustrative sequence for a short test course, not a claim about the length or validated features of the newly authored SF course. Turns, pickups and shortcuts must use actual course-distance/path geometry and collision data.

## Balance and acceptance

- Start boost tuning around 10–15% extra speed for 0.6–0.8 seconds; cap stacking and reward each feature once. These are test candidates.
- Active, deliberate driving should consistently outperform an assisted/coasting baseline with the same build. Mistakes should cost time without creating repeated rescue loops.
- Do not require constant tapping. A player must be able to explain why they took a line or used a boost.
- Test novices and experienced players across representative builds. Check that pads, pickups and shortcuts are physically reachable for all supported wheelbases.
- Verify simultaneous steering/hopping, canceled touches, rotation, reconnects, frame pacing and round-trip input delay on an actual iPhone Safari session with a laptop host.
- Keep the shared-screen spectacle readable: overtakes, boost trails, distinct player colors and short event callouts.

## Coordination

The existing performance task owns the isolated phone rendering/interpolation fix. The mechanics task owns physical steering, course-relative progress and recovery. Root coordinates phone controls and transport after those interfaces are validated. The track and art tasks continue their separate assets. This research brief does not authorize independent conflicting deployments or imply that proposed mechanics are already live.
