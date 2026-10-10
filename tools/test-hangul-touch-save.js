// usage: NODE_PATH=$(npm root -g) node tools/test-hangul-touch-save.js hangul/index.html [screenshot-dir]
// 1) Saved progress from the earlier version (3 writes per letter, texts-based resume) loads unchanged and resumes.
// 2) Hand/palm touches never count: touch outside the letter, two contacts at once, palm-sized contact, finger after pen.
// 3) Screenshots of the two quiz rounds.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const INPUT = path.resolve(process.argv[2] || 'hangul/index.html');
const SHOTS = process.argv[3] ? path.resolve(process.argv[3]) : null;
const hook = '\nsyncSound(); syncSettings(); renderHome();\n})();';
const dbg = path.join(os.tmpdir(), 'touch-save-dbg.html');
fs.writeFileSync(dbg, fs.readFileSync(INPUT, 'utf8').replace(hook, '\nsyncSound(); syncSettings(); renderHome();\nwindow.__d={st,store,startSession,mixTasks};\n})();'));
const parseD = (d) => d.slice(1).split(' L').map((s) => s.trim().split(/\s+/).map(Number));
const OLD = { stars: { 'j:ㄱ': 2, 'j:ㄴ': 3, 'j:ㄷ': 3, 'j:ㄹ': 3, 'j:ㅁ': 2 }, names: ['김서윤'], muted: false, stages: { '1-1': 3, '1-2': 2 }, weak: { 'j:ㅁ': 1 },
  days: { '2026-10-09': 24 }, medals: [], unlockAll: false, goal: 20, total: 40,
  resume: { def: { title: '1-3 세로 먼저', kind: 'stage', stageId: '1-3', texts: ['ㅂ', 'ㅅ', 'ㅇ'], reps: null, watch: null }, returnTo: 'home', results: [3],
    before: { total: 31, day: 0, medals: 0 }, savedAt: 1, itemIdx: 1, repIdx: 2, unitIdx: 0, strokeIdx: 1, itemMistakes: 0 } };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  await ctx.addInitScript((old) => { if (!localStorage.getItem('hangul-stroke-notebook:v1')) localStorage.setItem('hangul-stroke-notebook:v1', JSON.stringify(old)); }, OLD);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + dbg); await page.waitForTimeout(500);
  const cdp = await ctx.newCDPSession(page);

  // ---------- 1. old progress ----------
  const home = await page.evaluate(() => ({
    stars: document.querySelector('#homeStars').textContent, level: document.querySelector('#lvName').textContent,
    stickers: document.querySelectorAll('#stickers .sticker:not(.locked)').length, medalsShelf: document.querySelectorAll('#medals .medal').length,
    doneNodes: [...document.querySelectorAll('.node.done')].map((n) => n.getAttribute('aria-label')), cont: document.querySelector('#continueBtn').innerText.replace(/\n/g, ' | '),
  }));
  console.log('1. home with old save:', JSON.stringify(home));
  await page.click('#continueBtn'); await page.waitForTimeout(300);
  const r = await page.evaluate(() => { const s = window.__d.st; return { item: s.sess.items[s.itemIdx].text, mode: s.mode, rep: s.repIdx, k: s.strokeIdx, done: document.querySelectorAll('#board g.done path').length, reps: s.sess.items[s.itemIdx].reps }; });
  console.log('   resumed old in-progress stage at:', JSON.stringify(r));

  // ---------- helpers ----------
  const box = async () => page.locator('#board').boundingBox();
  const toScreen = (b, [x, y]) => ({ x: b.x + (x / 100) * b.width, y: b.y + (y / 100) * b.height });
  async function touchLine(pts, { radius = 1, extra = null } = {}) {
    const b = await box(); const P = [];
    for (let i = 1; i < pts.length; i++) for (let k = 0; k < 6; k++) { const t = k / 6; P.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]); }
    P.push(pts[pts.length - 1]);
    const tp = (p) => [Object.assign(toScreen(b, p), { id: 1, radiusX: radius, radiusY: radius }), ...(extra ? [Object.assign(toScreen(b, extra), { id: 2, radiusX: 1, radiusY: 1 })] : [])];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(P[0]) });
    for (const p of P.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(p) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(80);
  }
  async function penLine(pts) {
    const b = await box();
    await page.evaluate(({ pts, b }) => {
      const el = document.querySelector('#board');
      const fire = (type, [x, y]) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'pen', isPrimary: true, bubbles: true, cancelable: true, clientX: b.x + (x / 100) * b.width, clientY: b.y + (y / 100) * b.height }));
      fire('pointerdown', pts[0]); for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], c = pts[i]; for (let k = 1; k <= 6; k++) fire('pointermove', [a[0] + (c[0] - a[0]) * k / 6, a[1] + (c[1] - a[1]) * k / 6]); }
      fire('pointerup', pts[pts.length - 1]);
    }, { pts, b });
    await page.waitForTimeout(80);
  }
  const snap = () => page.evaluate(() => ({ k: window.__d.st.strokeIdx, mistakes: window.__d.st.itemMistakes, msg: document.querySelector('#msg').textContent, ink: document.querySelectorAll('#board g.ink > path.ink').length }));
  const strokes = async () => (await page.$$eval('#board g.gl path', (ps) => ps.map((p) => p.getAttribute('d')))).map(parseD);

  // ---------- 2. hand touches on a fresh free-practice letter (ㄹ, 혼자 쓰기 round so mistakes would count) ----------
  await page.evaluate(() => { window.__d.startSession({ title: '손 터치 확인', kind: 'free', tasks: [{ text: 'ㄹ', reps: ['faint'], watch: false }] }, 'free'); });
  await page.waitForTimeout(200);
  const s0 = await snap(); const ss = await strokes();
  await touchLine([[3, 96], [20, 97], [40, 97]]);                 // resting hand along the bottom edge of the square
  const a1 = await snap();
  await touchLine(ss[1].slice().reverse(), { extra: [50, 50] });  // wrong stroke drawn while a second finger touches
  const a2 = await snap();
  await touchLine(ss[2], { radius: 30 });                          // palm-sized contact
  const a3 = await snap();
  await touchLine(ss[1]);                                          // a real finger mistake still counts
  const a4 = await snap();
  console.log('2. outside the letter:', a1.mistakes === s0.mistakes && a1.msg === s0.msg ? 'ignored' : 'COUNTED ' + JSON.stringify(a1));
  console.log('   two contacts at once:', a2.mistakes === a1.mistakes && a2.k === a1.k && a2.ink === 0 ? 'ignored' : 'COUNTED ' + JSON.stringify(a2));
  console.log('   palm-sized contact:', a3.mistakes === a2.mistakes && a3.k === a2.k ? 'ignored' : 'COUNTED ' + JSON.stringify(a3));
  console.log('   real finger mistake:', a4.mistakes === a3.mistakes + 1 ? 'counted (as it should)' : 'NOT COUNTED ' + JSON.stringify(a4), '|', a4.msg);
  await penLine(ss[0]);                                            // pen writes stroke 1
  const a5 = await snap();
  await touchLine(ss[2]);                                          // finger/palm right after the pen: ignored
  const a6 = await snap();
  console.log('   pen stroke accepted:', a5.k === 1 ? 'yes' : 'NO ' + JSON.stringify(a5), '| touch after pen:', a6.mistakes === a5.mistakes && a6.k === a5.k ? 'ignored' : 'COUNTED ' + JSON.stringify(a6));

  // ---------- 3. quiz screens ----------
  await page.evaluate(() => { window.__d.startSession({ title: '퀴즈 화면', kind: 'free', tasks: [{ text: 'ㅂ', reps: ['quiz'], watch: false, tag: 'quiz' }, { text: 'ㅌ', reps: ['qnum'], watch: false, tag: 'quiz', q: 2 }] }, 'free'); });
  await page.waitForTimeout(250);
  const b = await box(); const q = await strokes(); const mid = (pts) => pts[Math.floor(pts.length / 2)];
  await page.mouse.click(toScreen(b, mid(q[2])).x, toScreen(b, mid(q[2])).y); await page.waitForTimeout(150); // wrong: 3rd stroke first
  const qa = await snap();
  await page.mouse.click(toScreen(b, mid(q[0])).x, toScreen(b, mid(q[0])).y); await page.waitForTimeout(700);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'q-order.png') });
  console.log('3. order quiz: wrong tap ->', qa.msg, '| mistakes', qa.mistakes, '| after right tap k =', (await snap()).k);
  for (const k of [1, 2, 3]) { const p = mid(q[k]); await page.mouse.click(toScreen(b, p).x, toScreen(b, p).y); await page.waitForTimeout(700); }
  await page.waitForTimeout(1300);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'q-number.png') });
  await page.click('#qnumBox .qbtn:nth-child(1)'); await page.waitForTimeout(150);
  console.log('   number quiz: wrong answer ->', (await snap()).msg);
  await page.click('#qnumBox .qbtn:nth-child(3)'); await page.waitForTimeout(2500);
  console.log('   finished quizzes:', await page.locator('#winLayer').isVisible() ? 'end screen shown' : 'not finished');

  // ---------- 1b. old progress after finishing more work ----------
  const after = await page.evaluate(() => ({ total: window.__d.store.total, names: window.__d.store.names, stages: window.__d.store.stages, stickers: Math.floor(window.__d.store.total / 12) }));
  console.log('1b. store after playing:', JSON.stringify(after));
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
