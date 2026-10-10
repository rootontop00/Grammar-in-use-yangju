// usage: NODE_PATH=$(npm root -g) node tools/make-icons.js hangul/index.html hangul/
// Draws the home-screen icons (512, 192, 180 px) from the app's own stroke data for 가:
// full-bleed green tile, paper square inside the maskable safe zone, strokes in order colours with numbers.
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs'); const os = require('os');
const INPUT = path.resolve(process.argv[2] || 'hangul/index.html');
const out = path.resolve(process.argv[3] || path.dirname(INPUT));
const hook = '\nsyncSound(); syncSettings(); renderHome();\n})();';
const dbg = path.join(os.tmpdir(), 'icons-dbg.html');
fs.writeFileSync(dbg, fs.readFileSync(INPUT, 'utf8').replace(hook, '\nsyncSound(); syncSettings(); renderHome();\nwindow.__d={makeUnit};\n})();'));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + dbg);
  const strokes = await p.evaluate(() => { const u = window.__d.makeUnit('가', 'syllable'); return u.strokes.map((s) => ({ d: s.d, role: s.role, x: s.pts[0][0], y: s.pts[0][1] })); });
  // full-bleed green tile, paper square inside the maskable safe zone, 가 in stroke colours with order badges
  const col = { cho: '#E8483F', jung: '#2B74D8' };
  const g = strokes.map((s) => `<path d="${s.d}" fill="none" stroke="${col[s.role]}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const badges = strokes.map((s, i) => `<circle cx="${s.x}" cy="${s.y}" r="5.4" fill="${col[s.role]}"/><text x="${s.x}" y="${s.y + 2.3}" font-size="7" font-family="Arial, sans-serif" font-weight="700" fill="#fff" text-anchor="middle">${i + 1}</text>`).join('');
  const svg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 100 100">
    <rect width="100" height="100" fill="#2B8A5F"/>
    <rect x="17" y="17" width="66" height="66" rx="7" fill="#FFFEF8"/>
    <path d="M50 19 V81 M19 50 H81" stroke="#9FCDB4" stroke-width="0.9" stroke-dasharray="2.4 2.4"/>
    <g transform="translate(17 17) scale(0.66)">${g}${badges}</g></svg>`;
  for (const [name, n] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
    await p.setViewportSize({ width: n, height: n });
    await p.setContent(`<html><body style="margin:0">${svg(n)}</body></html>`);
    await p.screenshot({ path: path.join(out, name), clip: { x: 0, y: 0, width: n, height: n } });
  }
  await b.close();
})();
