import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {chromium, firefox, webkit} from 'playwright';
import {returningVisitor} from './returning-visitor.mjs';

const base = process.env.TEST_URL || 'http://127.0.0.1:4185/work-and-ai/';
const server = process.env.TEST_URL ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4185', '--strictPort'], {stdio: 'pipe', windowsHide: true});
const out = 'verification/local/tour-browser';
const key = 'work-and-ai:guided-tour:v1';
const titles = ['Find an occupation', 'Find by skills', 'Describe your work', 'Explore the occupation map', 'Compare skill patterns', 'Read the sources', 'Come back anytime'];
const productFiles = ['src/App.tsx', 'src/components/GuidedTour.tsx', 'src/components/guided-tour.css'];
const report = {status: 'FAIL', date: new Date().toISOString(), productSha256: Object.fromEntries(await Promise.all(productFiles.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')]))), engines: []};
await mkdir(out, {recursive: true});
const dialog = page => page.locator('#guided-tour[open]');
const button = (page, name) => dialog(page).getByRole('button', {name, exact: true});
async function settled(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function checkStep(page, index) {
  await dialog(page).getByRole('heading', {name: titles[index], exact: true}).waitFor();
  await settled(page);
  assert.equal(await dialog(page).count(), 1);
  assert.match(await dialog(page).innerText(), new RegExp(`${index + 1}\\s*(of|/)\\s*7`, 'i'));
  assert(await page.evaluate(() => document.querySelector('#guided-tour').contains(document.activeElement)), 'focus remains inside modal');
  const target = await page.locator('.tour-spotlight').getAttribute('data-target');
  assert(await page.locator(target).isVisible(), `visible target at step ${index + 1}`);
  // ResizeObserver/visualViewport notifications can follow the browser resize acknowledgement.
  await page.waitForFunction(() => {
    const spotlight = document.querySelector('.tour-spotlight'); if (!spotlight) return false;
    const s = spotlight.getBoundingClientRect(), target = document.querySelector(spotlight.dataset.target); if (!target) return false;
    const t = target.getBoundingClientRect(), card = document.querySelector('.tour-card').getBoundingClientRect();
    return Math.abs(s.left - Math.max(8, t.left - 6)) <= 3 && Math.abs(s.top - Math.max(8, t.top - 6)) <= 3 && Math.abs(s.right - Math.min(innerWidth - 8, t.right + 6)) <= 3 && Math.abs(s.bottom - Math.min(card.top - 16, t.bottom + 6)) <= 3;
  }, null, {timeout: 5000});
  const geometry = await page.evaluate(() => {
    const spotlight = document.querySelector('.tour-spotlight'), s = spotlight.getBoundingClientRect();
    const t = document.querySelector(spotlight.dataset.target).getBoundingClientRect(), card = document.querySelector('.tour-card').getBoundingClientRect();
    return {left: s.left, top: s.top, right: s.right, bottom: s.bottom, expectedLeft: Math.max(8, t.left - 6), expectedTop: Math.max(8, t.top - 6), expectedRight: Math.min(innerWidth - 8, t.right + 6), expectedBottom: Math.min(card.top - 16, t.bottom + 6)};
  });
  for (const edge of ['Left', 'Top', 'Right', 'Bottom']) assert(Math.abs(geometry[edge.toLowerCase()] - geometry[`expected${edge}`]) <= 3, `spotlight ${edge} aligns at step ${index + 1}: ${JSON.stringify(geometry)}`);
  const bounds = await page.evaluate(() => {
    const next = [...document.querySelectorAll('#guided-tour button')].find(e => /^(Next|Finish)$/.test(e.textContent.trim())).getBoundingClientRect();
    return {left: next.left, right: next.right, top: next.top, bottom: next.bottom, width: innerWidth, height: innerHeight, pageWidth: document.documentElement.scrollWidth};
  });
  assert(bounds.left >= 0 && bounds.right <= bounds.width + 1 && bounds.top >= 0 && bounds.bottom <= bounds.height + 1, `navigation visible: ${JSON.stringify(bounds)}`);
  assert(bounds.pageWidth <= bounds.width + 1, 'no page overflow');
}
async function walk(page, {screenshots, back = false} = {}) {
  for (let i = 0; i < titles.length; i++) {
    await checkStep(page, i);
    if (i === 3) { await page.locator('.map-canvas').waitFor(); await settled(page); }
    if (i === 4) { await page.locator('.patterns-table tbody tr').first().waitFor(); await settled(page); }
    if (screenshots) await page.screenshot({path: `${out}/${screenshots}-${i + 1}.png`});
    if (back && i === 2) { await button(page, 'Back').click(); await checkStep(page, 1); await button(page, 'Next').click(); await checkStep(page, 2); }
    await button(page, i === titles.length - 1 ? 'Finish' : 'Next').click();
  }
  await dialog(page).waitFor({state: 'detached'});
}
async function start(page) { await page.locator('#tour-replay').click(); await checkStep(page, 0); }
async function escape(page) { await page.keyboard.press('Escape'); await dialog(page).waitFor({state: 'detached'}); await settled(page); assert.equal(await page.locator('#tour-replay').evaluate(e => e === document.activeElement), true); }
async function state(page) {
  return page.evaluate(() => ({query: document.querySelector('#job-title').value, selected: document.querySelector('#occupation-heading')?.textContent, comparison: document.querySelector('.comparison thead')?.textContent, limit: document.querySelector('#result-limit').value, hash: location.hash, panel: [...document.querySelectorAll('main > [role="tabpanel"]')].find(e => !e.hidden)?.id, scroll: scrollY}));
}
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  for (const [name, type] of Object.entries({chromium, firefox, webkit}).filter(([name]) => !process.env.TEST_ENGINES || process.env.TEST_ENGINES.split(',').includes(name))) {
    const browser = await type.launch({headless: true});
    const result = {name, checks: [], errors: []}; report.engines.push(result);
    const context = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
    context.on('page', page => page.on('pageerror', e => result.errors.push(String(e))));
    try {
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      const requests = []; page.on('request', request => requests.push(request.url() + (request.postData() || '')));
      let release; const held = new Promise(resolve => release = resolve);
      await page.route('**/data/occupations.json', async route => { await held; await route.continue(); });
      await page.goto(base); assert.equal(await dialog(page).count(), 0); assert.equal(await page.evaluate(k => localStorage.getItem(k), key), null);
      release(); await checkStep(page, 0); await page.unroute('**/data/occupations.json');
      await walk(page, {screenshots: name === 'chromium' ? 'desktop' : null, back: true});
      assert.equal(await page.evaluate(k => localStorage.getItem(k), key), 'seen');
      await page.reload(); await page.waitForFunction(() => document.querySelector('#job-title')?.disabled === false); assert.equal(await dialog(page).count(), 0);
      await start(page); await button(page, 'Skip tour').click(); await page.reload(); await page.waitForFunction(() => document.querySelector('#job-title')?.disabled === false); assert.equal(await dialog(page).count(), 0);
      const firstSkip = await browser.newPage(); await firstSkip.goto(base); await checkStep(firstSkip, 0); await button(firstSkip, 'Skip tour').click(); await firstSkip.reload(); await firstSkip.waitForFunction(() => document.querySelector('#job-title')?.disabled === false); assert.equal(await dialog(firstSkip).count(), 0); await firstSkip.close();
      result.checks.push('AS-01/02: delayed readiness, first visit, all seven steps, Back, completion, Skip, reload and replay');

      await start(page);
      for (const press of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) { await page.keyboard.press(press); assert(await page.evaluate(() => document.querySelector('#guided-tour').contains(document.activeElement))); }
      await page.locator('#job-title').evaluate(e => e.focus()); assert(await page.evaluate(() => document.querySelector('#guided-tour').contains(document.activeElement)));
      await escape(page);
      for (const query of ['registered nurse', 'pharmacist']) { await page.locator('#job-title').fill(query); await page.locator('button.candidate').first().click(); await page.getByRole('button', {name: 'Add to comparison', exact: true}).click(); }
      await page.locator('#result-limit').selectOption('3');
      await page.getByRole('button', {name: 'Share comparison', exact: true}).click();
      await page.evaluate(() => window.scrollTo(0, 500)); await settled(page);
      const before = await state(page); assert(before.scroll > 100);
      await page.locator('#tour-replay').evaluate(e => e.focus({preventScroll: true})); await page.keyboard.press('Enter');
      await checkStep(page, 0); await walk(page); await settled(page); const after = await state(page);
      assert(Math.abs(before.scroll - after.scroll) <= 2, 'original scroll restored'); delete before.scroll; delete after.scroll; assert.deepEqual(after, before);
      await start(page); await button(page, 'Next').click(); await button(page, 'Skip tour').click(); const skipped = await state(page); delete skipped.scroll; assert.deepEqual(skipped, before);
      const shared = await browser.newPage(); await shared.goto(page.url()); await checkStep(shared, 0); await walk(shared); assert.equal(await shared.locator('.comparison thead th').count(), 3); await shared.close();
      result.checks.push('AS-03/05: keyboard trap, inert background focus, Escape focus return, populated comparison/search/share preserved, fresh shared URL');

      await page.getByRole('button', {name: 'Find by skills', exact: true}).click();
      await page.locator('#skill-filter').fill('Programming'); await page.getByRole('checkbox', {name: 'Programming', exact: true}).check();
      const skillsBefore = await page.locator('.suggestions').innerText(); await start(page); await walk(page);
      assert.equal(await page.locator('#skill-filter').inputValue(), 'Programming'); assert(await page.getByRole('checkbox', {name: 'Programming', exact: true}).isChecked()); assert.equal(await page.locator('.suggestions').innerText(), skillsBefore);
      await page.getByRole('button', {name: 'Find by work description', exact: true}).click();
      const draft = 'PRIVATE_TOUR_DRAFT I prepare financial statements and examine accounting records.';
      await page.locator('#responsibilities').fill(draft); await page.getByRole('button', {name: 'Search wording only', exact: true}).click();
      const wordingBefore = await page.locator('[data-method="wording"]').innerText();
      await start(page); await walk(page); assert.equal(await page.locator('#responsibilities').inputValue(), draft); assert.equal(await page.locator('[data-method="wording"]').innerText(), wordingBefore);
      await page.getByRole('tab', {name: 'Occupation map', exact: true}).click(); await page.getByTestId('map-node').first().click(); await page.locator('#map-search').fill('nurse');
      await page.waitForTimeout(700); const mapBefore = await page.getByTestId('map-selection-caption').innerText(); await start(page); await walk(page);
      assert(await page.locator('#map-view').isVisible()); assert.equal(await page.locator('#map-search').inputValue(), 'nurse'); assert.equal(await page.getByTestId('map-selection-caption').innerText(), mapBefore);
      await page.getByRole('tab', {name: 'Skill patterns', exact: true}).click(); await page.locator('#patterns-search').fill('Programming'); await page.locator('#patterns-baseline').selectOption('rest'); await page.locator('.pattern-sort').first().click();
      const patternsBefore = await page.locator('.patterns-table').innerText(); await start(page); await walk(page);
      assert(await page.locator('#patterns-view').isVisible()); assert.equal(await page.locator('#patterns-search').inputValue(), 'Programming'); assert.equal(await page.locator('#patterns-baseline').inputValue(), 'rest'); assert.equal(await page.locator('.patterns-table').innerText(), patternsBefore);
      result.checks.push('AS-04: skills selections/results, description draft, map selection/filter and pattern filter/baseline/sort survive full replay');

      for (const viewport of [{width: 320, height: 568}, {width: 390, height: 844}, {width: 640, height: 450}]) { await start(page); await page.setViewportSize(viewport); await walk(page, {screenshots: name === 'chromium' ? `mobile-${viewport.width}` : null, back: true}); }
      await page.setViewportSize({width: 1280, height: 900}); await page.evaluate(() => document.documentElement.style.zoom = '2'); await start(page); await walk(page, {screenshots: name === 'chromium' ? 'zoom200' : null}); await page.evaluate(() => document.documentElement.style.zoom = '1');
      assert(!requests.some(url => /\.onnx|\.wasm|vectors\.bin|PRIVATE_TOUR_DRAFT/.test(url)));
      await start(page); await page.emulateMedia({media: 'print'}); assert.equal(await page.locator('#tour-replay').isVisible(), false); assert.equal(await dialog(page).isVisible(), false); await page.emulateMedia({media: 'screen'}); await escape(page);
      result.checks.push('AS-06/10: desktop/mobile/zoom geometry, no semantic download or draft transmission, print hides tour');

      const denied = await browser.newPage(); denied.on('pageerror', e => result.errors.push(String(e)));
      await denied.addInitScript(() => { for (const method of ['getItem', 'setItem']) Storage.prototype[method] = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
      await denied.goto(base); await checkStep(denied, 0); await escape(denied); await denied.getByRole('tab', {name: 'Occupation map', exact: true}).click(); assert.equal(await dialog(denied).count(), 0); await start(denied); await escape(denied); await denied.close();
      result.checks.push('AS-08: denied storage remains usable with no repeated presentation during mount');

      const failure = await context.newPage(); await returningVisitor(failure); let fail = true;
      await failure.route('**/data/skills.json', route => fail ? route.fulfill({status: 503, body: 'Unavailable'}) : route.continue());
      await failure.goto(base); await start(failure); for (let i = 0; i < 3; i++) await button(failure, 'Next').click();
      await failure.getByRole('button', {name: 'Retry map reference'}).waitFor(); await checkStep(failure, 3); await button(failure, 'Next').click(); await checkStep(failure, 4); await escape(failure);
      await failure.getByRole('tab', {name: 'Occupation map', exact: true}).click(); await failure.getByRole('button', {name: 'Retry map reference'}).waitFor(); fail = false; await failure.getByRole('button', {name: 'Retry map reference'}).click(); await failure.getByTestId('map-node').first().waitFor();
      await failure.close();
      const patternsFailure = await context.newPage(); await returningVisitor(patternsFailure); let corrupt = true;
      await patternsFailure.route('**/data/skill-patterns.json', route => corrupt ? route.fulfill({status: 200, contentType: 'application/json', body: '{}'}) : route.continue());
      await patternsFailure.goto(base); await start(patternsFailure); for (let i = 0; i < 4; i++) await button(patternsFailure, 'Next').click();
      await patternsFailure.getByRole('button', {name: 'Retry skill analysis'}).waitFor(); await checkStep(patternsFailure, 4); await escape(patternsFailure);
      await patternsFailure.locator('#job-title').fill('nurse'); await patternsFailure.locator('button.candidate').first().waitFor();
      await patternsFailure.getByRole('tab', {name: 'Skill patterns', exact: true}).click(); corrupt = false; await patternsFailure.getByRole('button', {name: 'Retry skill analysis'}).click(); await patternsFailure.locator('.patterns-table tbody tr').first().waitFor(); await patternsFailure.close();
      const focusRace = await context.newPage(); await returningVisitor(focusRace); let releaseFocus; const focusDelayed = new Promise(resolve => releaseFocus = resolve);
      await focusRace.route('**/data/skills.json', async route => { await focusDelayed; await route.continue(); });
      await focusRace.goto(base); await focusRace.getByRole('button', {name: 'Find by skills', exact: true}).click(); await start(focusRace); releaseFocus(); await focusRace.locator('#skill-filter').waitFor(); await checkStep(focusRace, 0); await escape(focusRace); await focusRace.close();
      const race = await context.newPage(); await returningVisitor(race); let releaseSkills; const delayed = new Promise(resolve => releaseSkills = resolve);
      await race.route('**/data/skills.json', async route => { await delayed; await route.continue(); });
      await race.goto(base); await race.locator('#job-title').fill('registered nurse'); await race.locator('button.candidate').first().waitFor();
      // Same event turn leaves the selection's deferred focus pending as the modal opens.
      await race.evaluate(() => {document.querySelector('button.candidate').click(); document.querySelector('#tour-replay').click();}); await checkStep(race, 0);
      for (let i = 0; i < 4; i++) await button(race, 'Next').click(); await button(race, 'Back').click(); await escape(race);
      const raceBefore = await state(race); releaseSkills(); await race.waitForLoadState('networkidle'); await settled(race);
      assert.deepEqual(await state(race), raceBefore); assert.equal(await race.locator('#tour-replay').evaluate(e => e === document.activeElement), true);
      assert.equal(await dialog(race).count(), 0); assert(await race.locator('#search-view').isVisible()); await race.close();
      const coreFailure = await browser.newPage(); await coreFailure.route('**/data/occupations.json', route => route.fulfill({status: 503})); await coreFailure.goto(base); await coreFailure.getByRole('alert').waitFor(); assert.equal(await dialog(coreFailure).count(), 0); await coreFailure.close();
      result.checks.push('AS-07/09: missing skills target fallback, retry, late loading after rapid Back/close, initial core failure');
      assert.deepEqual(result.errors, []);
      console.log(`${name}: tour checks passed`);
    } finally { await browser.close(); }
  }
  report.status = 'PASS';
} catch (error) { report.error = String(error); throw error; }
finally { server?.kill(); await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); }
