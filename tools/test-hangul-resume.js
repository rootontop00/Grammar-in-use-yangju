const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
// usage: NODE_PATH=$(npm root -g) node tools/test-hangul-resume.js hangul/index.html [screenshot-dir]
// Checks resuming after a reload mid-letter, after the back button mid-word, and after closing during the final celebration.
// Works on the hosted page or a wrapped standalone copy; a debug copy exposing internals is written to the temp dir.
const os = require('os');
const INPUT = path.resolve(process.argv[2] || 'hangul/index.html');
const SHOTS = process.argv[3] ? path.resolve(process.argv[3]) : null;
const src = fs.readFileSync(INPUT, 'utf8');
const hook = '\nsyncSound(); syncSettings(); renderHome();\n})();';
fs.writeFileSync(path.join(os.tmpdir(), 'test3-dbg.html'), src.replace(hook, '\nsyncSound(); syncSettings(); renderHome();\nwindow.__d={st,store,curReps:()=>curReps()};\n})();'));
const parseD = (d) => d.slice(1).split(' L').map((s) => s.trim().split(/\s+/).map(Number));
function resample(p, sp) { const out = [p[0]]; let acc = 0; for (let i = 1; i < p.length; i++) { let a = p[i - 1], b = p[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]); while (acc + seg >= sp && seg > 0) { const t = (sp - acc) / seg; const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; out.push(q); a = q; seg = Math.hypot(b[0] - a[0], b[1] - a[1]); acc = 0; } acc += seg; } out.push(p[p.length - 1]); return out; }
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const url = 'file://' + path.join(os.tmpdir(), 'test3-dbg.html');
  await page.goto(url); await page.waitForTimeout(500);
  async function draw(pts, off = [0, 0]) {
    const box = await page.locator('#board').boundingBox();
    const P = resample(pts, 2.5).map(([x, y]) => [x + off[0], y + off[1]]);
    const S = ([x, y]) => [box.x + (x / 100) * box.width, box.y + (y / 100) * box.height];
    await page.mouse.move(...S(P[0])); await page.mouse.down();
    for (const p of P.slice(1)) await page.mouse.move(...S(p));
    await page.mouse.up(); await page.waitForTimeout(30);
  }
  const state = () => page.evaluate(() => { const s = window.__d.st; return { mode: s.mode, busy: s.busy, item: s.itemIdx, rep: s.repIdx, unit: s.unitIdx, k: s.strokeIdx, mistakes: s.itemMistakes, units: s.units.length, nItems: s.sess ? s.sess.items.length : 0, reps: s.sess ? window.__d.curReps().length : 0, nStrokes: s.units[s.unitIdx] ? s.units[s.unitIdx].strokes.length : 0, q: s.sess ? s.sess.items[s.itemIdx].q : null }; });
  const strokes = async () => (await page.$$eval('#board g.gl path', (ps) => ps.map((p) => p.getAttribute('d')))).map(parseD);
  async function ready() {
    for (let t = 0; t < 200; t++) {
      if (await page.locator('#winLayer').isVisible()) return 'win';
      const s = await state();
      if (s.mode === 'watch') { const b = await page.locator('#board').boundingBox(); await page.mouse.click(b.x + 5, b.y + 5); await page.waitForTimeout(80); continue; }
      if (!s.busy) return 'ready';
      await page.waitForTimeout(80);
    }
    throw new Error('never ready');
  }

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
  // play until stop(state) is true (checked before each stroke) or the session ends
  async function play(stop = () => false) {
    for (let g = 0; g < 600; g++) {
      if ((await ready()) === 'win') return 'win';
      const s = await state();
      if (stop(s)) return 'stopped';
      await act(s, await strokes());
    }
  }
  const resumeInfo = () => page.evaluate(() => { const r = window.__d.store.resume; return r && { title: r.def.title, item: r.itemIdx, rep: r.repIdx, unit: r.unitIdx, k: r.strokeIdx, m: r.itemMistakes }; });

  // 0. clear 1-1 so 1-2 opens
  await page.click('#continueBtn'); await page.click('#sheet .btn.primary');
  await play(); await page.click('#win .btn:nth-child(2)');

  // 1. 1-2 (ㄹ ㅁ): round 1 done, round 2 one stroke + one mistake, then the app is reloaded
  await page.click('#continueBtn'); await page.click('#sheet .btn.primary');
  await play((s) => s.item === 0 && s.rep === 1 && s.k === 1);
  let ss = await strokes();
  await draw(ss[1].slice().reverse()); // mistake on stroke 2
  console.log('1. before reload:', JSON.stringify(await state()), 'saved:', JSON.stringify(await resumeInfo()));
  await page.reload(); await page.waitForTimeout(400);
  console.log('   home button:', (await page.locator('#continueBtn').innerText()).replace(/\n/g, ' | '), '| node flag:', await page.locator('.flag').allTextContents());
  await page.click('#continueBtn'); await page.waitForTimeout(300);
  const back = await state();
  console.log('   resumed at:', JSON.stringify({ item: back.item, rep: back.rep, k: back.k, mistakes: back.mistakes, mode: back.mode }), '| done strokes on board:', await page.locator('#board g.done path').count(), '| msg:', await page.locator('#msg').textContent());
  await play();
  console.log('   finished: session results =', await page.evaluate(() => JSON.stringify(window.__d.st.sess.items.map((it, i) => it.text + ':' + it.reps.join('+') + '=' + window.__d.st.sess.results[i]))), '| resume =', JSON.stringify(await resumeInfo()), '| retry button:', await page.locator('#win .btn.green').textContent().catch(() => 'none'));
  // retry the wrong letters right away
  await page.click('#win .btn.green'); await page.waitForTimeout(200);
  console.log('   retry session:', await page.locator('#sessTitle').textContent(), '| items:', await page.locator('#items .ichip').allInnerTexts());
  await play(); await page.click('#win .btn:nth-child(2)');

  // 2. word stage: leave with the back button in the middle of '마'
  await page.click('.parents summary'); await page.check('#unlockAll');
  await page.click('.chapter:nth-child(5) .ch-head');
  await page.click('.chapter:nth-child(5) .node[aria-label^="5-1 "]');
  await page.click('#sheet .btn.primary');
  await play((s) => s.item === 0 && s.rep === 0 && s.unit === 1 && s.k === 2);
  await page.click('#backBtn'); await page.waitForTimeout(150);
  console.log('2. toast:', await page.locator('#toast').textContent(), '| saved:', JSON.stringify(await resumeInfo()));
  if (!(await page.locator('.chapter:nth-child(5).open').count())) await page.click('.chapter:nth-child(5) .ch-head');
  await page.click('.chapter:nth-child(5) .node[aria-label^="5-1 "]');
  console.log('   sheet buttons:', await page.locator('#sheet .btn').allTextContents(), '|', await page.locator('#sheet .tip').textContent());
  await page.click('#sheet .btn.primary'); await page.waitForTimeout(300);
  const w = await state();
  console.log('   resumed at unit', w.unit, 'stroke', w.k, '| syllable row:', await page.locator('#wordLine').innerText().then((t) => t.replace(/\s+/g, ' ')), '| done strokes:', await page.locator('#board g.done path').count());
  await page.click('#backBtn');

  // 3. app closes during the final star animation of a stage → stage still counts
  await page.click('.chapter:nth-child(1) .ch-head');
  await page.click('.chapter:nth-child(1) .node[aria-label^="1-4 "]');
  await page.click('#sheet .btn.primary');
  await play((s) => s.item === s.nItems - 1 && s.rep === s.reps - 1 && s.unit === s.units - 1 && (s.mode === 'qnum' || s.k === s.nStrokes - 1));
  ss = await strokes(); const s3 = await state();
  await act(s3, ss);
  await page.reload(); await page.waitForTimeout(300);
  console.log('3. after closing mid-celebration: stage 1-4 =', await page.evaluate(() => window.__d.store.stages['1-4']), '| resume =', JSON.stringify(await resumeInfo()), '| home button:', (await page.locator('#continueBtn').innerText()).replace(/\n/g, ' | '));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
