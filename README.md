# גבי ושחר - האחים צ'וריסו - המרדף אחרי הנקניקייה

Chorizo Brothers: a mobile arcade highway game. One HTML file, Three.js (r128 from cdnjs), no build step.
Hebrew UI (RTL). Live: https://chorizo-brothers.vercel.app (Vercel, auto-deploys on push to `main`).

## Play
A 3-lap race against 5 rivals on 4 tracks (ring, sausage, clover, zigzag). You start last; wins pay more, unlock tracks and move you up the sausage leagues.

- **Steering (default on phones):** tilt the phone left/right to steer, forward to speed up, back to brake. Or switch to finger-drag steering in the menu.
- **Tap** the middle of the screen for nitro; tap the left/right side for a **side slam** (blades lunge sideways, wrecking cars alongside; needs the side-blades upgrade).
- **Green arrows** mark only the cars you can destroy right now.
- **Rear mirror** opens when a cop is behind; drop **puncture mines** (always) or **explosive mines** (upgrade) to stop chasers.
- **Currency:** glowing chorizo sausages. **Bonuses** (stack with each other, same type refreshes its timer): hot dog (turbo), bratwurst (power ram), merguez (magnet), salami (+heart), chorizo queen (all).
- **Weapons:** missiles (optional lock-on sight), electric shock, chorizo missiles, front/side blades, mines.
- **Garage:** 4 vehicles, paint, nitro flame, 8 upgrades (priced for a slow climb).
- **Enemies:** traffic, police chasers (from lap 2), and on the zigzag track the vegetarian produce truck boss (lettuce volleys, killed only by missiles).
- **Accounts:** pick a username (no password) to keep progress across devices and appear on the leaderboard.
- **Extras:** 15 achievements, daily missions, adaptive music, slow-motion impacts (reduced-flash setting).

## Develop
Open `index.html` in a browser. Tests (Playwright + Chromium, real touch events): see `tests/README.md`.
