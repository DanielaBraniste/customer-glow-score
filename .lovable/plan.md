# Add Rescuro logo as favicon

## Context
The Rescuro logo (a rounded emerald-green box with a white bold "R") is currently rendered as HTML/CSS in the Navbar and Footer — there is no image asset. The favicon is still the default Lovable `public/favicon.ico`. The primary brand color is `hsl(152 60% 38%)` = `#279B65` (dark mode), foreground white.

## Plan
1. **Create `public/favicon.svg`** — a crisp, scalable SVG matching the logo: a rounded emerald square (`#279B65`) with a white bold "R" centered (font-family Arial/Helvetica, font-weight bold). SVG is chosen over PNG so it stays sharp at all sizes and matches the vector nature of the CSS logo.
2. **Update `index.html`** — replace the `<link rel="icon" href="/favicon.ico" type="image/x-icon" />` line with `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`.
3. **Delete `public/favicon.ico`** — browsers request `/favicon.ico` by default; leaving it would override the new SVG icon.

## Result
The browser tab will show the Rescuro "R" logo instead of the default Lovable icon, on every route.
