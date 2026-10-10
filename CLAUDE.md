# גבי ושחר - האחים צ'וריסו - המרדף אחרי הנקניקייה (code name: ring-rush)

Single-file mobile arcade game: `index.html` (Three.js r128 from cdnjs). UI language is Hebrew (RTL).

## Rules
- Before every commit, artifact publish or Vercel deploy that touches `index.html`, run `node tests/ui-smoke.mjs`
  and `node tests/gameplay-smoke.mjs`. Both must end with all checks passing. Do not publish with a failing test.
- Menus (`.panel`) must stay scrollable by touch. Never add a global `touchmove` `preventDefault`;
  never center a scrollable flex container with `justify-content:center` (it clips the top).
  Primary actions in tall panels live in a sticky footer (`.sfoot`).
- Test menus with real touch events (CDP `Input.dispatchTouchEvent`), not only mouse clicks or `scrollTop`.
- Artifact publishing: build from `index.html` by stripping the `<html>/<head>/<body>` wrappers, keeping
  `<title>`, `<style>` and the body content; add `color-scheme:dark` to `:root` and `dir="rtl"` on `#app`.
- Currency is the glowing sausage coin (save key stays `coins`). Bonuses are sausages (hot dog = turbo, bratwurst = power ram,
  merguez = magnet, salami = heart, chorizo queen = all). Every car material goes through `glowify()` so cars stay visible on the dark road.
- Hosting: Vercel (static `index.html`, project `chorizo-brothers`). The Claude artifact copy is built from the same file.
