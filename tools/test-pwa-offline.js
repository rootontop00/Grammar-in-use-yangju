// usage: python3 -m http.server 8765 --bind 127.0.0.1 & SERVER=$! ; NODE_PATH=$(npm root -g) node tools/test-pwa-offline.js http://localhost:8765/hangul/ ; kill $SERVER
// Checks the installed-app setup: manifest and installability report no errors, the service worker takes control,
// and with the network off the page still opens and a stage can start.
const { chromium } = require('playwright');
const URL_ = process.argv[2] || 'http://localhost:8765/hangul/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL_);
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForTimeout(500);
  const cdp = await ctx.newCDPSession(p);
  const man = await cdp.send('Page.getAppManifest');
  const inst = await cdp.send('Page.getInstallabilityErrors');
  console.log('manifest errors:', JSON.stringify(man.errors), '| installability errors:', JSON.stringify(inst.installabilityErrors));
  console.log('controlled by SW:', await p.evaluate(() => !!navigator.serviceWorker.controller));
  console.log('caches:', JSON.stringify(await p.evaluate(async () => { const out = {}; for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname); return out; })));
  await ctx.setOffline(true);
  await p.reload(); await p.waitForTimeout(600);
  console.log('offline title:', await p.title(), '| home visible:', await p.locator('#home').isVisible(), '| chapters:', await p.locator('.chapter').count());
  await p.click('#continueBtn'); await p.click('#sheet .btn.primary'); await p.waitForTimeout(400);
  console.log('offline practice opened:', await p.locator('#practice').isVisible(), await p.locator('#sessTitle').textContent());
  console.log('errors:', errs.filter((e) => !/fonts\.g/.test(e)).length ? errs : 'none (font fetch failures offline ignored)');
  await b.close();
})();
