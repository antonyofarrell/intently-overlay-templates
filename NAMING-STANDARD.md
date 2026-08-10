# intent.ly overlay CSS variable standard

A single, predictable vocabulary of `--smc-*` custom properties for overlay templates.
Brand Studio's Extract only writes to declared variables, so the more consistently
templates use these names, the more of an overlay re-skins automatically from one extraction.

## Why it matters

- **Automation:** the scraper pulls a site's real tokens (button colour, text colour, background, fonts). If every template exposes the *same* named slots, mapping site → overlay becomes near-deterministic instead of a per-template guess.
- **Editing:** the Brand Studio left panel shows one field per declared variable, so a fully variable-ized template is fully editable by hand too.
- **Handover:** anyone building a new overlay uses the same names, so tooling and teammates always know what each value is.

## The naming rules

A variable name should tell you its CSS property. Encode **type as a suffix** and **role as a prefix**.

- **Type suffixes:** `Bkg` (background) · `Colour` (colour) · `Border` (border *shorthand*) · `BorderRadius` (corner radius) · `Padding` · `FontWeight` · `Font` (family)
- **Role prefixes:** `main` · `card` · `btn` · `frame` · `text` · `accent`
- **British spelling:** `Colour`, not `Color` (matches intent.ly).
- **Secondary variants take `2`:** `textColour` / `textColour2`, `font` / `font2`.
- **Never bare or ambiguous:** not `--smc-btn`, `--smc-text`, `--smc-border`. Always qualify (`--smc-btnBkg`, `--smc-textColour`, `--smc-frameBorderRadius`).
- **`Border` vs `BorderRadius` is strict:** `*Border` is always a border shorthand (`1px solid #000`); `*BorderRadius` is always a radius (`4px`). This holds for both button and frame — see below.

## The canonical vocabulary

| Variable | Role | Value kind | Extract maps into it |
|---|---|---|---|
| `--smc-mainBkg` | overlay / main background | colour | page background |
| `--smc-cardBkg` | inner card / cart / panel background | colour | card / surface background |
| `--smc-textColour` | primary text | colour | body text colour |
| `--smc-textColour2` | secondary / muted text | colour | muted text colour |
| `--smc-accent` | brand accent (non-button) | colour | brand primary / accent |
| `--smc-btnBkg` | button background | colour | CTA / primary colour (or `theme-color`) |
| `--smc-btnText` | button text | colour | colour contrasting `btnBkg` |
| `--smc-btnBkgHover` | button hover background | colour | darker CTA variant |
| `--smc-btnBorder` | button border | border shorthand | match `btnBkg` (filled CTA) |
| `--smc-btnBorderRadius` | button corner radius | radius | site button radius |
| `--smc-btnPadding` | button padding | length | usually structural, not branded |
| `--smc-btnFontWeight` | button font weight | number | kept within the imported font weights |
| `--smc-frameBorder` | outer frame border | border shorthand | only if the design has one |
| `--smc-frameBorderRadius` | outer frame corner radius | radius | site card / container radius |
| `--smc-font2` | heading / secondary font family | font family | site heading font |
| `--smc-fontSm` / `--smc-fontRg` / `--smc-fontLg` | font-size scale | length | structural (not branded) |

The overlay's **body font** is set via the `@import` line plus `smc-bg * { font-family: … }`, which
Brand Studio updates directly — it does not need a variable.

### The `Border` / `BorderRadius` rule, worked

```css
smc-overlay-inner {
  --smc-btnBorder: 1px solid #6c31ff;   /* a real border   → *Border          */
  --smc-btnBorderRadius: 3px;           /* the button radius → *BorderRadius    */
  --smc-frameBorderRadius: 4px;         /* the OUTER frame's corner radius      */
}
```

`--smc-frameBorderRadius` is the outer overlay's corner radius — nothing to do with the button.
Only add `--smc-frameBorder` when the overlay frame actually has a visible border.

## Adding variables to a template

1. Declare the block once, on `smc-overlay-inner` (or `:root` / `smc-bg`), using the names above.
2. Replace the hardcoded brand-relevant values in the rules with `var(--smc-…)`.
3. Leave **structural** values hardcoded (widths, positions, transitions, layout paddings) — only brand-relevant colour / font / radius / button values become variables.
4. Rendering must be identical afterwards (same values via `var()`), so the overlay is safe to paste unchanged.

`overlay-design-templates/output/DB0001/style.css` is the reference example.

## Tooling

- **Brand Studio → Extract** writes brand values into these variables.
- **Brand Studio → ⚡ Flatten & copy** resolves every `var(--…)` back to concrete values for the production paste (no custom properties left).
- **`node standardize-variables.js`** migrates a template's older/inconsistent variable names to this standard (dry-run by default; `--apply` to write). High-confidence renames are automatic; ambiguous names are reported for a human decision.
