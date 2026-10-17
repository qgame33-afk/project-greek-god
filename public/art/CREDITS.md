# Art credits

## Source photograph

| | |
|---|---|
| Object | **Marble statue of Hermes** (Statue of Hermes) |
| Culture / period | Roman, Imperial |
| Date | 1st or 2nd century CE |
| Medium | Marble, Pentelic |
| Museum | The Metropolitan Museum of Art, New York, Department of Greek and Roman Art |
| Accession no. | 56.234.15 (Gift of The Hearst Foundation, 1956) |
| Met object ID | 254925 |
| Object URL | https://www.metmuseum.org/art/collection/search/254925 |
| Image used | Detail photograph `DP253648.jpg` (head and shoulders, three-quarter view): https://images.metmuseum.org/CRDImages/gr/original/DP253648.jpg |
| License | **Public domain / CC0.** The Met Open Access program (`isPublicDomain: true` in the Collection API). See https://www.metmuseum.org/policies/image-resources |

Attribution isn't required under CC0. We still credit the source: *Marble statue of Hermes, Roman, 1st or 2nd century CE. The Metropolitan Museum of Art, Gift of The Hearst Foundation, 1956 (56.234.15).*

## Derived files

All three raster files below come from the single source photograph above. Each one is mirrored horizontally so the figure gazes left, into the page content.

- `statue-hero.webp` (900×1200): the statue is cut out from the studio backdrop and the background replaced with #08090C. The image is graded as a warm tritone (shadows #08090C, warm-grey mids, ivory highlights near #E9DCC2), with edge-preserving smoothing of surface staining, a soft spotlight falloff, and fades to black at the bottom and left.
- `statue-mask.webp` (768×1024, white RGB with an alpha channel): a line-engraving rendering of the bust made for CSS `mask-image`. Hatch-line width follows the statue's lit form, crevices are cut back out of the lines, and a silhouette contour is added.
- `statue-portrait.webp` (512×512): a head crop graded like the hero.

## Original artwork (no third-party source)

These were drawn from scratch for this project:

- The laurel-and-"A" brand mark and every icon in `/public/icons`, plus `src/app/icon.png` and `src/app/apple-icon.png`
- `marble-veins.svg`
- All SVG motifs in `src/components/art/` (`Mark.tsx`, `Motifs.tsx`)

## Olympus grades (UI v2)

Made by `scripts/dev/grade-statue.mjs` (deterministic; sharp) from `statue-hero.webp`, so they share its CC0 source above:

- `statue-marble.webp` (900×1200 RGBA): the marble grade (#09090B → #F3EDE1) with an alpha channel cut from the photo itself (a closed silhouette plus a luminance ramp, fading toward the base).
- `statue-gold.webp` (900×1200 RGBA): the gold-leaf grade (#120B04 → #CF9A3A → #FFF4D6, an S-curve, local contrast, fine leaf grain baked in) on the same alpha, so the two stack pixel for pixel with identical blacks.
- `grain.png` (256×256): a seeded monochrome noise tile, used at 6% over leaf surfaces.

Original artwork (no third-party source): `ridge.svg` (the decorative Ascent ridge), `coin-rim.svg` (the beaded coin rim) and the Olympus icon set in `src/components/art/icons.tsx`.
