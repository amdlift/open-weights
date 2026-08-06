# Charts

Hand-built SVG on `d3-scale`. No charting library: the app needs three forms, and
owning the markup is what lets every mark honour the specs below and read from the
theme's CSS custom properties in both light and dark.

## The palette is validated — do not eyeball changes

`--ow-series-1..6` in `src/app.css` are a fixed categorical order. They were checked
with the data-viz palette validator against this app's real surfaces
(`#ffffff` light, `#1a1c20` dark) on the *adjacent* pairlist, which is the correct
list for lines and stacked bars:

| Mode | Worst adjacent CVD ΔE | Worst adjacent normal-vision ΔE | Contrast |
| --- | --- | --- | --- |
| light | 9.1 (protan) | 19.6 | slots 3/4/5 below 3:1 → relief applies |
| dark | 8.4 (protan) | 19.3 | all ≥ 3:1 |

Consequences that the components already implement, and that must survive any edit:

- Series colour follows the **entity**, never its position in a filtered list.
- Every multi-series chart ships a legend **and** direct labels — the light-mode
  contrast warning obliges visible labels, and four series makes them mandatory
  regardless.
- Text never wears the series colour. A swatch beside the text carries identity.
- Never add a seventh generated hue. Fold the tail into "Other" or facet instead.

If you change a colour, re-run the validator for both modes and both pairlists
before committing.

## Mark specs

- Lines 2px, round cap/join. Markers r ≥ 4 with a 2px surface ring.
- Columns capped at 24px wide, 4px rounded cap, square at the baseline.
- A 2px surface-coloured gap between stacked segments — never a stroke.
- Area fills are a ~10% wash of the series hue.
- Gridlines are hairline, solid, one step off the surface, and recessive.
- One y-axis. Never two.
