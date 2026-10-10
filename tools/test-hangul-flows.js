const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
// usage: NODE_PATH=$(npm root -g) node tools/test-hangul-flows.js hangul/index.html [screenshot-dir]
// Checks every stroke of every item (correct tracing accepted, reversed rejected), then drives stages, review, chapter test, words, sentences and free practice.
// Works on the hosted page or a wrapped standalone copy; a debug copy exposing internals is written to the temp dir.
const os = require('os');
const INPUT = path.resolve(process.argv[2] || 'hangul/index.html');
const SHOTS = process.argv[3] ? path.resolve(process.argv[3]) : null;
const src = fs.readFileSync(INPUT, 'utf8');
const hook = '\nsyncSound(); syncSettings(); renderHome();\n})();';
if (!src.includes(hook)) throw new Error('hook not found');
fs.writeFileSync(path.join(os.tmpdir(), 'test2-dbg.html'), src.replace(hook, '\nsyncSound(); syncSettings(); renderHome();\nwindow.__d={makeUnit,judge,st,STAGES,THEMES,SENTENCES,CONS19,VOW21,TABLE_C,TABLE_V,compose,resample,isSyl,store};\n})();'));
const parseD = (d) => d.slice(1).split(' L').map((s) => s.trim().split(/\s+/).map(Number));
function resample(p, sp) { const out = [p[0]]; let acc = 0; for (let i = 1; i < p.length; i++) { let a = p[i - 1], b = p[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]); while (acc + seg >= sp && seg > 0) { const t = (sp - acc) / seg; const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; out.push(q); a = q; seg = Math.hypot(b[0] - a[0], b[1] - a[1]); acc = 0; } acc += seg; } out.push(p[p.length - 1]); return out; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(os.tmpdir(), 'test2-dbg.html'));
  await page.waitForTimeout(1000);

  // ---------- A. every stroke of every item in the content ----------
  const A = await page.evaluate(() => {
    const D = window.__d; const texts = new Set();
    D.STAGES.forEach((s) => (s.items || []).forEach((t) => texts.add(t)));
    D.THEMES.forEach((t) => t[1].forEach((x) => texts.add(x)));
    D.SENTENCES.forEach((x) => texts.add(x)); D.CONS19.forEach((x) => texts.add(x)); D.VOW21.forEach((x) => texts.add(x));
    D.TABLE_C.forEach((c) => D.TABLE_V.forEach((v) => texts.add(D.compose(c, v, ''))));
    const units = new Map();
    for (const t of texts) {
      if ([...t].length === 1 && !D.isSyl(t)) units.set('j' + t, D.makeUnit(t, 'jamo'));
      else for (const ch of t) if (D.isSyl(ch)) units.set('s' + ch, D.makeUnit(ch, 'syllable'));
    }
    let strokes = 0; const fails = [];
    for (const [k, u] of units) {
      D.st.units = [u]; D.st.unitIdx = 0;
      u.strokes.forEach((s, i) => {
        D.st.strokeIdx = i; strokes++;
        const off = [(i % 2 ? 1 : -1) * 2, 1.6];
        const pts = D.resample(s.pts, 2.5).map(([x, y], j) => [x + off[0] + Math.sin(j * 1.7) * 1.1, y + off[1] + Math.cos(j * 2.3) * 1.1]);
        const r = D.judge(pts);
        if (r.type !== 'ok') fails.push(`${k} stroke ${i + 1}: ${r.type}${r.k !== undefined ? ' k=' + (r.k + 1) : ''}`);
        if (s.len > 14 && !s.loop) { const rr = D.judge(pts.slice().reverse()); if (rr.type === 'ok') fails.push(`${k} stroke ${i + 1}: reversed accepted`); }
      });
    }
    return { texts: texts.size, units: units.size, strokes, fails };
  });
  console.log(`A. ${A.texts} items, ${A.units} distinct letters, ${A.strokes} strokes checked; fails: ${A.fails.length ? JSON.stringify(A.fails.slice(0, 30)) : 'none'}`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'n-home.png'), fullPage: true });

  // ---------- helpers for UI flows ----------
  async function draw(pts, off = [0, 0]) {
    const box = await page.locator('#board').boundingBox();
    const P = resample(pts, 2.5).map(([x, y], j) => [x + off[0] + Math.sin(j) * 0.8, y + off[1]]);
    const S = ([x, y]) => [box.x + (x / 100) * box.width, box.y + (y / 100) * box.height];
    await page.mouse.move(...S(P[0])); await page.mouse.down();
    for (const p of P.slice(1)) await page.mouse.move(...S(p));
    await page.mouse.up(); await page.waitForTimeout(30);
  }
  const state = () => page.evaluate(() => { const s = window.__d.st; return { mode: s.mode, busy: s.busy, item: s.itemIdx, rep: s.repIdx, unit: s.unitIdx, k: s.strokeIdx, sess: !!s.sess, q: s.sess ? s.sess.items[s.itemIdx].q : null }; });

  // perform the expected action for the current round: draw the stroke, tap it (순서 맞히기) or press its number (몇 번째 획?)
  async function act(s, strokesNow, off = [0, 0]) {
    const box = await page.locator('#board').boundingBox();
    if (s.mode === 'quiz') {
      const pts = strokesNow[s.k], m = pts[Math.floor(pts.length / 2)];
      await page.mouse.click(box.x + (m[0] / 100) * box.width, box.y + (m[1] / 100) * box.height);
      await page.waitForTimeout(40);
    } else if (s.mode === 'qnum') {
      await page.click(`#qnumBox .qbtn:nth-child(${(s.q || 0) + 1})`);
      await page.waitForTimeout(40);
    } else await draw(strokesNow[s.k], off);
  }
  const winOpen = () => page.locator('#winLayer').isVisible();
  async function ready() {
    for (let t = 0; t < 200; t++) {
      if (await winOpen()) return 'win';
      const s = await state();
      if (s.mode === 'watch') { const b = await page.locator('#board').boundingBox(); await page.mouse.click(b.x + 5, b.y + 5); await page.waitForTimeout(100); continue; }
      if (!s.busy) return 'ready';
      await page.waitForTimeout(100);
    }
    throw new Error('never ready');
  }
  // completes the whole session; mistakesAt: set of "item:rep" where a reversed stroke is drawn first
  const modes = {};
  async function playSession(mistakesAt = new Set()) {
    let guard = 0;
    while (guard++ < 800) {
      if ((await ready()) === 'win') return true;
      const s = await state();
      const strokes = (await page.$$eval('#board g.gl path', (ps) => ps.map((p) => p.getAttribute('d')))).map(parseD);
      const tag = `${s.item}:${s.rep}`;
      if (s.k === 0 && s.unit === 0 && mistakesAt.has(tag) && ['trace', 'faint', 'ghost'].includes(s.mode)) { mistakesAt.delete(tag); await draw(strokes[0].slice().reverse()); await page.waitForTimeout(60); continue; }
      modes[s.mode] = (modes[s.mode] || 0) + 1;
      await act(s, strokes, [(s.k % 2 ? 1.5 : -1.5), 1.2]);
      const after = await state();
      if (after.k === s.k && after.unit === s.unit && after.rep === s.rep && after.item === s.item && !after.busy) throw new Error('stroke rejected at ' + JSON.stringify(s) + ' msg=' + await page.locator('#msg').textContent());
    }
    throw new Error('session too long');
  }

  // ---------- B. first stage via "이어서 하기", with one mistake ----------
  await page.click('#continueBtn');
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'n-sheet.png') });
  await page.click('#sheet .btn.primary');
  await page.waitForTimeout(1800);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'n-watch.png'), fullPage: true });
  await playSession(new Set(['0:1']));
  await page.waitForTimeout(400);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'n-win.png') });
  const B = await page.evaluate(() => ({ stages: window.__d.store.stages, weak: window.__d.store.weak, total: window.__d.store.total, days: window.__d.store.days, win: document.querySelector('#win').innerText.replace(/\s+/g, ' ') }));
  console.log('B.', JSON.stringify(B));

  // next stage straight from the win sheet
  await page.click('#win .btn.primary');
  await playSession();
  console.log('B2. after 1-2:', JSON.stringify(await page.evaluate(() => window.__d.store.stages)));
  await page.click('#win .btn:nth-child(2)'); // 지도 보기
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'n-home2.png'), fullPage: true });

  // ---------- C. review ----------
  // make sure there is something to review (reminders inside lessons may already have cleared the slips)
  await page.evaluate(() => { const st = window.__d.store; if (!Object.keys(st.weak).length) { st.weak['j:ㄹ'] = 2; st.weak['j:ㅁ'] = 1; } });
  await page.click('#freeBtn'); await page.click('#freeBack');
  await page.click('#reviewBtn');
  await playSession();
  console.log('C. review done, weak now:', JSON.stringify(await page.evaluate(() => window.__d.store.weak)));
  await page.click('#win .btn:nth-child(2)');

  // ---------- D. unlock all, then chapter test, a word stage, a sentence stage ----------
  await page.click('.parents summary');
  await page.check('#unlockAll');
  for (const id of ['1-T', '5-5', '6-4', '4-10']) {
    await page.evaluate((id) => { const s = window.__d.STAGES.find((x) => x.id === id); window.__d.st.returnTo = 'home'; document.querySelector('#continueBtn'); }, id);
    // open the chapter and click the node
    const ci = parseInt(id) - 1;
    const chOpen = await page.locator(`.chapter:nth-child(${ci + 1}).open`).count();
    if (!chOpen) await page.click(`.chapter:nth-child(${ci + 1}) .ch-head`);
    await page.click(`.chapter:nth-child(${ci + 1}) .node[aria-label^="${id} "]`);
    await page.click('#sheet .btn.primary');
    if (id === '6-4') { await page.waitForTimeout(500); if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'n-sentence.png'), fullPage: true }); }
    await playSession();
    const t = await page.locator('#win h2').textContent();
    console.log(`D. ${id}: "${t}"`, await page.locator('#win .banner').allTextContents());
    if (id === '1-T') if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'n-win-test.png') });
    await page.click('#win .btn:nth-child(2)');
    await page.waitForTimeout(200);
  }

  // ---------- E. free practice tabs ----------
  await page.click('#freeBtn');
  for (let i = 1; i <= 6; i++) {
    await page.click(`#freeTabs .tab:nth-child(${i})`);
    await page.waitForTimeout(150);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `n-free${i}.png`), fullPage: true });
  }
  // builder: 꽃 → ㄲ ㅗ ㅊ
  await page.click('#freeTabs .tab:nth-child(3)');
  await page.click('.builder .chips >> nth=0 >> text=ㄲ');
  await page.click('.builder .chips >> nth=1 >> text=ㅗ');
  await page.click('.builder .chips >> nth=2 >> text=ㅊ');
  const bt = await page.locator('.builder .btn.primary').textContent();
  await page.click('.builder .btn.primary');
  await playSession();
  console.log('E. builder:', bt, '->', await page.locator('#win h2').textContent());
  await page.click('#win .btn:nth-child(2)');
  // name with a space
  await page.click('#freeTabs .tab:nth-child(6)');
  await page.fill('#nameInput', '나는 서윤');
  await page.click('.name-form button');
  await playSession();
  console.log('E. name:', await page.locator('#win h2').textContent(), '| names:', JSON.stringify(await page.evaluate(() => window.__d.store.names)));
  await page.click('#win .btn:nth-child(2)');
  await page.fill('#nameInput', 'abc');
  await page.click('.name-form button');
  console.log('E. invalid name msg:', await page.locator('.err').textContent());
  console.log('modes used:', JSON.stringify(modes));
  console.log('scrollWidth:', await page.evaluate(() => document.documentElement.scrollWidth));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
