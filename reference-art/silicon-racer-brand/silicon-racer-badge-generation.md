# Silicon Racer badge extraction

Built-in ImageGen was used. One badge extraction and one targeted transparency correction were attempted.

## Production cream fallback

- File: `silicon-racer-badge.png`
- Dimensions: 1254 × 1254
- Color mode: RGB, opaque; no alpha channel.
- Visual QA: correct spelling and badge design; one complete badge; no checkerboard, scenery, tagline, bottom wordmark, or UI.
- Background QA: visually clean cream, but subtle color variation remains rather than mathematically flat #F7F0DF. Common sampled colors are #F7F0DE and #F7F0DF. Top 25 rows contain 35 RGB colors, with channel ranges R245–249, G238–242, B216–224. Intended for a matching cream surface.
- No application code was edited.

### Cream fallback prompt

Use case: precise-object-edit. Asset type: production Silicon Racer primary logo badge on a solid cream web UI surface. Extract/recreate only the large primary badge from upper left of supplied reference, preserving its exact design, outline silhouette, arrangement, font and lettering, colors, and proportions. Badge elements: deep forest outline and cream interior, vermilion Golden Gate bridge, pale mint clouds, two checkered racing flags, forest curved road; exact text "SILICON" above "RACER" and "SAN FRANCISCO" in footer with one cream star. Put this single badge on a perfectly flat, uniform, opaque cream #F7F0DF background. Square ~1024x1024 canvas. Center complete badge close to canvas edges with approximately 3 percent clear margin on all sides. Background MUST be a clean solid flat digital color #F7F0DF without texture, noise, gradient, paper grain, shadows, borders or checkerboard. Badge graphic edges crisp and clean. No tagline, no scenery, no people, no cars, no road scene, no bottom alternate wordmark, no number 01, no secondary icon, no UI controls. Only the single primary badge and the plain cream background. Match selected logo exactly; no redesign.

## Candidate

- File: `silicon-racer-badge-candidate-rgb.png`
- Dimensions: 1254 × 1254
- Color mode: RGB
- Alpha channel: **absent**
- Background: checkerboard baked into image pixels.
- Status: visual reference only; **not ready for direct overlay in the UI**.
- Visual review: one centered forest/cream/vermilion badge; SILICON, RACER, SAN FRANCISCO readable; bridge, flags, road, clouds and star present; no tagline, scene or bottom alternate wordmark.

The transparency correction also returned RGB without alpha. This checkerboard candidate was not used as the final asset; the production file above is the later opaque cream fallback. No application code was edited.

## Extraction prompt

Use case: background-extraction. Asset type: production logo badge PNG for Silicon Racer game UI. Edit target: supplied image. Extract/recreate JUST the primary large badge in the upper left, preserving its exact design, silhouette, arrangement, typography, text, colors and proportions. It has the deep forest outline and cream-filled badge, vermilion Golden Gate bridge, pale mint clouds, two checkered racing flags, forest curving road, huge forest SILICON lettering above huge vermilion RACER lettering, the SAN FRANCISCO small uppercase footer, and one cream star. Exact badge text: "SILICON" "RACER" "SAN FRANCISCO". Preserve the badge artwork with crisp clean flat graphic edges. Produce one approximately 1024x1024 square PNG with a genuinely transparent alpha background around the badge and in no part of its cream-colored badge interior. Center the complete badge with modest even transparent margins. No cast shadow, no white rectangular backdrop, no checkerboard rendered into the pixels. REMOVE ALL outside content: no tagline, no scenery, no cars, no people, no footer wordmark, no number 01, no secondary bridge icon, no UI. Only the one primary badge. Do not add text or redesign any badge element. This is an extraction, not a new logo exploration.

## Targeted correction prompt

Use case: background-extraction. Correct this one existing Silicon Racer badge PNG only. Preserve all badge pixels/design/shape/colors/text and position. Remove the gray checkerboard around the badge and make the outside background genuinely transparent, encoded in an RGBA alpha channel with alpha=0 outside the badge. Do not draw a checkerboard and do not fill the outside with any solid color. Keep the cream inside of the enclosed badge opaque, and keep the exact forest outline, vermilion bridge, flags, SILICON RACER text, SAN FRANCISCO footer and star intact. Output one square transparent PNG for direct overlay in a web interface. No redesign, no extra elements, no shadow. Actual alpha transparency is the only requested edit.
