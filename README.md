# גבי ושחר - האחים צ'וריסו - המרדף אחרי הנקניקייה

Chorizo Brothers: a mobile arcade highway game. One HTML file, Three.js (r128 from cdnjs), no build step.
Hebrew UI (RTL). Live: https://chorizo-brothers.vercel.app (Vercel, auto-deploys on push to `main`).

## Play
Swipe or tap the sides to change lane, tap the middle for nitro, swipe down to brake.
Corner buttons: missile, electric shock, chorizo missile (after buying it).

- **Currency:** glowing chorizo sausages. **Bonuses:** hot dog (turbo), bratwurst (power ram), merguez (magnet), salami (+heart), chorizo queen (all).
- **Weapons:** missiles (with optional lock-on sight), electric shock (close/mid range), chorizo missiles (area blast), front/side rams.
- **Garage:** 4 vehicles (sport, jeep, taxi, armored), paint, nitro flame, 7 upgrades.
- **Enemies:** traffic, police chasers (from lap 2), and every 3rd lap the vegetarian produce truck boss, who throws heads of lettuce (killed only by missiles).
- **Extras:** 15 achievements (the last one gives a crown), daily missions, adaptive music, slow-motion impacts (with a reduced-flash setting).

## Develop
Open `index.html` in a browser. Tests (Playwright + Chromium, real touch events): see `tests/README.md`.
