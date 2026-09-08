# Doodle Derby — first playable milestone

Public playable URL: https://doodle-derby-akshat.quiteparticular.chatgpt.site

Project: this repository root. See its README for startup and controls.

The first working version was built with three implementation specialists and a lead integrator. The basic browser preview was available within the requested 30-minute window.

Implemented: 12 selectable bodies, three wheel types, three wheelbase settings, ten-bolt constraints, independent F/J charge-and-hop controls, real 3D suspension and landings, contained lanes, split cameras, a short downhill course, checkpoint recovery, three-heat state flow, points, results, and rematch. SF scenery includes a Golden Gate bridge segment, Lombard-inspired flower/brick landscaping, Painted Ladies, Coit Tower, and the Transamerica skyline.

Validation: the production build, type checks, and focused lint checks pass. Reproducible physics checks cover grounded charge, caps, airborne lock, independent cancellation, safe focus loss, recovery without progress gain, full-course player-slot fairness, and all 12 starter builds completing deliberate two-hop runs in 31.87–33.77 seconds. Deliberate timing outperformed representative coasting/tapping/repeated-full-charge patterns. Browser inspection confirmed live movement, SF scenery, selectable models, real finish times and recoveries, a full three-heat session, correct cumulative standings, and rematch returning to heat one.

Remaining: live Astra integration; structured accept/keep/restore recommendations; persistent build history; broader human balance and accessibility testing; richer impact audio; actual curved driving routes if steering becomes part of the scope. Lombard is currently visual inspiration, not a geographically accurate switchback road. Local pit tips are explicitly labeled and require no API key.

## Phone-party update

Published publicly with no sign-in required. Shared race screen now creates a two-player room with QR code and six-character code. Each phone has its own garage, readiness, charge control, progress and results. WebRTC input uses an HTTP relay fallback. Host physics remains authoritative; stale controller connections pause the race and clear charge. Rooms expire after two hours and phone tokens reclaim their original slot. A host-page refresh needs a new room.

Production checks passed for anonymous phone page, room creation, two distinct controllers, full-room handling, readiness and independent input relay; the test room was closed. Local browser confirmed QR pairing UI, individual garage and a phone build change reaching the shared screen. SQLite-backed server tests and simulated two-phone transport tests covered disconnect/reclaim, readiness across heats, SDP correlation, duplicate/stale inputs and budget constraints. Typecheck, focused lint, production build and existing physics checks passed. Actual-phone network latency and browser ICE interoperability still need broader playtesting.
