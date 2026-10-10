// UI smoke test for Ring Rush: drives the menus with REAL touch events (CDP) on several phone sizes.
// Guards against the "shop is stuck on the phone" bug class: unscrollable panels, clipped tops,
// buttons hidden under sticky bars, purchases that do not register or that jump the scroll position.
//
// Run:   node tests/ui-smoke.mjs            (needs playwright + a chromium; see tests/README.md)
// Env:   PLAYWRIGHT_PATH, CHROMIUM_PATH, THREE_JS_PATH (optional local copy of three.min.js)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const pwPath = process.env.PLAYWRIGHT_PATH || ['playwright', '/opt/node-tools/node_modules/playwright'].find((p) => { try { require.resolve(p); return true; } catch (e) { return false; } });
const { chromium } = require(pwPath);
const URL = 'file://' + resolve(here, '..', 'index.html');
const exe = process.env.CHROMIUM_PATH || (process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers') + '/chromium';
const threeLocal = process.env.THREE_JS_PATH;

const ALL_VIEWPORTS = [[390, 844], [360, 640], [412, 915], [320, 568], [844, 390]];
const VIEWPORTS = process.env.VIEWPORTS ? process.env.VIEWPORTS.split(',').map((v) => v.split('x').map(Number)) : ALL_VIEWPORTS; // e.g. VIEWPORTS=390x844,360x640
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log((ok ? '  PASS ' : '  FAIL ') + name + (extra ? '  ' + extra : '')); };

async function main() {
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  for (const [w, h] of VIEWPORTS) {
    console.log(`\n== ${w}x${h} ==`);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('ringrush.v1', JSON.stringify({ coins: 30000, tut: true })); } catch (e) {} });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    if (threeLocal) await page.route('**/three.min.js', (r) => r.fulfill({ body: readFileSync(threeLocal), contentType: 'application/javascript' }));
    await page.goto(URL);
    await page.waitForFunction(() => window.RingRush, null, { timeout: 20000 });
    await page.waitForTimeout(600);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const swipeUp = async (dist = 160) => { const x = w / 2, y0 = h * 0.7; await touch('touchStart', x, y0); for (let i = 1; i <= 8; i++) { await touch('touchMove', x, y0 - (dist * i) / 8); await page.waitForTimeout(12); } await touch('touchEnd'); await page.waitForTimeout(350); };
    const swipeDown = async (dist = 160) => { const x = w / 2, y0 = h * 0.3; await touch('touchStart', x, y0); for (let i = 1; i <= 8; i++) { await touch('touchMove', x, y0 + (dist * i) / 8); await page.waitForTimeout(12); } await touch('touchEnd'); await page.waitForTimeout(350); };
    const scrollTop = () => page.evaluate(() => document.getElementById('garage').scrollTop);
    // a tap lands on the target only if it is on screen and nothing (e.g. a sticky bar) covers its centre
    const hitInfo = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2; const top = document.elementFromPoint(cx, cy); return { cx, cy, onScreen: cx >= 0 && cx <= innerWidth && cy >= 0 && cy <= innerHeight, hit: !!top && (top === e || e.contains(top)) }; }, sel);
    let lastTapScroll = 0;
    const reachAndTap = async (sel, label) => {
      for (let i = 0; i < 24; i++) { const hi = await hitInfo(sel); if (hi && hi.onScreen && hi.hit) { lastTapScroll = await scrollTop(); await touch('touchStart', hi.cx, hi.cy); await touch('touchEnd'); await page.waitForTimeout(250); return true; } await swipeUp(120); }
      check('reachable by touch scrolling: ' + label, false); return false;
    };
    const coins = () => page.evaluate(() => JSON.parse(localStorage.getItem('ringrush.v1')).coins);

    // ---- menu -> garage
    check('menu is visible and play button reachable', !!(await hitInfo('#btnPlay'))?.onScreen);
    await reachAndTap('#btnGarage', 'garage button');
    const head = await page.evaluate(() => { const g = document.getElementById('garage'); const t = g.querySelector('.ghead').getBoundingClientRect(); return { top: t.top, hidden: g.classList.contains('hidden'), scrollable: g.scrollHeight > g.clientHeight + 4 }; });
    check('garage opens', !head.hidden);
    check('garage header is not clipped above the screen', head.top >= -1, 'top=' + Math.round(head.top));
    if (head.scrollable) {
      await swipeUp(220); const a = await scrollTop();
      check('garage scrolls with a real touch swipe', a > 20, 'scrollTop=' + Math.round(a));
      await swipeDown(400); await swipeDown(400);
      check('garage scrolls back to the very top', (await scrollTop()) <= 1);
    }
    // ---- buy every upgrade by touch
    const names = await page.evaluate(() => [...document.querySelectorAll('#gUp .up b')].map((b) => b.textContent));
    check('all upgrade rows are present', names.length >= 7, names.join(' | '));
    let bought = 0;
    for (let i = 0; i < names.length; i++) {
      const sel = `#gUp .up:nth-child(${i + 1}) button.buy`;
      if (!(await page.$(sel))) continue;
      const before = await coins();
      const lvlBefore = await page.evaluate((idx) => document.querySelectorAll(`#gUp .up:nth-child(${idx}) .pip.on`).length, i + 1);
      if (!(await reachAndTap(sel, names[i]))) continue;
      const after = await coins(), st1 = await scrollTop(), st0 = lastTapScroll;
      const lvlAfter = await page.evaluate((idx) => document.querySelectorAll(`#gUp .up:nth-child(${idx}) .pip.on`).length, i + 1);
      const ok = after < before && lvlAfter === lvlBefore + 1;
      check('touch purchase works: ' + names[i], ok, `coins ${before}->${after}, level ${lvlBefore}->${lvlAfter}`);
      check('scroll position kept after purchase: ' + names[i], Math.abs(st1 - st0) < 6, `scrollTop ${Math.round(st0)}->${Math.round(st1)}`);
      if (ok) bought++;
    }
    check('bought at least 7 upgrades', bought >= 7, 'bought=' + bought);
    const toastInfo = await page.evaluate(() => { const box = document.getElementById('toast'), t = box.querySelector('.toast'), g = document.getElementById('garage'); if (!t) return null; const r = t.getBoundingClientRect(); return { above: +getComputedStyle(box).zIndex > +getComputedStyle(g).zIndex, inside: r.width > 0 && r.top >= 0 && r.bottom <= innerHeight }; });
    check('purchase toast is shown above the garage', !!toastInfo && toastInfo.above && toastInfo.inside, JSON.stringify(toastInfo));
    // ---- back, then the purchases must take effect in a run
    await reachAndTap('#btnGarageBack', 'back button');
    check('back returns to the menu', await page.evaluate(() => document.getElementById('garage').classList.contains('hidden') && !document.getElementById('menu').classList.contains('hidden')));
    await reachAndTap('#btnPlay', 'play button');
    await page.waitForTimeout(300);
    const run = await page.evaluate(() => ({ ammo: RingRush.ammo(), st: RingRush.state() }));
    const savedUp = await page.evaluate(() => JSON.parse(localStorage.getItem('ringrush.v1')).up);
    check('upgrades persist (one level each)', ['sight', 'ramF', 'ramS', 'missiles', 'shock', 'chorizo', 'armor'].every((k) => savedUp[k] === 1), JSON.stringify(savedUp));
    check('upgrades apply in the run (hearts 4, missiles 5, shocks 5, chorizo 2)', run.ammo.maxLives === 4 && run.ammo.missiles === 5 && run.ammo.shocks === 5 && run.ammo.chorizo === 2, JSON.stringify(run.ammo));
    // ---- pause panel
    await reachAndTap('#btnPause', 'pause button');
    check('pause panel opens', await page.evaluate(() => !document.getElementById('pause').classList.contains('hidden')));
    await reachAndTap('#btnResume', 'resume button');
    check('resume closes the pause panel', await page.evaluate(() => document.getElementById('pause').classList.contains('hidden')));
    // ---- game over panel -> garage -> back
    await page.evaluate(() => RingRush.endRun());
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => { const o = document.getElementById('over'); const t = o.querySelector('h2').getBoundingClientRect(); return { top: t.top, hidden: o.classList.contains('hidden') }; });
    check('game-over panel shows, title not clipped', !over.hidden && over.top >= -1, 'top=' + Math.round(over.top));
    check('"again" button reachable on the game-over panel', !!(await hitInfo('#btnAgain'))?.hit);
    await reachAndTap('#btnGarage2', 'garage from game over');
    check('garage opens from the game-over panel', await page.evaluate(() => !document.getElementById('garage').classList.contains('hidden')));
    await reachAndTap('#btnGarageBack', 'back to game over');
    check('back returns to the game-over panel', await page.evaluate(() => !document.getElementById('over').classList.contains('hidden')));
    check('no page errors', errors.length === 0, errors.slice(0, 2).join(' / '));
    await ctx.close();
  }
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log('FAILED:\n - ' + failed.map((f) => f.name).join('\n - ')); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(2); });
