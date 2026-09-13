import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const base = process.env.TEST_URL || 'http://127.0.0.1:4173/work-and-ai/';
const out = resolve(process.env.OUTPUT_DIR || 'verification/local/skill-patterns');
const browser = await chromium.launch({headless: true});
const report = {status: 'FAIL', checks: [], errors: []};
const requests = [];
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('request', request => requests.push(request.url()));
  const tab = name => page.getByRole('tab', {name, exact: true});
  await page.goto(base);
  await page.getByRole('searchbox', {name: 'Job title', exact: true}).fill('registered nurse');
  await page.locator('.candidate').first().waitFor();
  assert(!requests.some(url => /SkillPatterns-/.test(url)), 'Patterns chunk loads on demand');
  const patternsStart = performance.now();
  await tab('Skill patterns').click();
  await page.locator('.patterns-table tbody tr').first().waitFor();
  report.patternsOpenMs = Math.round(performance.now() - patternsStart);
  assert.equal(await page.locator('#patterns-category').inputValue(), 'Very high');
  assert.equal(await page.locator('.patterns-table tbody tr').count(), 35);
  assert.equal(await page.getByRole('combobox', {name: 'Comparison baseline', exact: true}).inputValue(), 'overall');
  assert.match(await page.locator('.patterns-table tbody tr').first().innerText(), /Writing.*185 \/ 192.*466 \/ 772/s);
  assert.match(await page.locator('.pattern-highlight.coverage').innerText(), /206.*vs.*831/s);
  assert.match(await page.locator('.pattern-highlight.more').innerText(), /Writing.*185 \/ 192 vs 466 \/ 772/s);
  assert.equal(await page.locator('h1:visible').count(), 1);
  for (const category of ['Low', 'Moderate', 'High', 'Very high']) {
    await page.locator('#patterns-category').selectOption(category);
    assert.equal(await page.locator('.patterns-table tbody tr').count(), 35);
    assert.match(await page.locator('.patterns-table caption').innerText(), new RegExp(category));
  }
  const programming = page.locator('.patterns-table tbody tr').filter({has: page.locator('.pattern-skill-name', {hasText: /^Programming$/})});
  assert.match(await programming.innerText(), /2.96×.*19 \/ 175.*19 \/ 518.*\+7.2 pp/s);
  const evidence = await programming.locator('.pattern-evidence summary:text-is("Bayesian model details")').innerText();
  const probability = await programming.locator('.pattern-evidence p strong').first().textContent();
  await page.getByRole('searchbox', {name: 'Filter skills', exact: true}).fill('Programming');
  assert.equal(await page.locator('.patterns-table tbody tr').count(), 1);
  assert.equal(await programming.locator('.pattern-evidence summary:text-is("Bayesian model details")').innerText(), evidence);
  assert.equal(evidence, 'Bayesian model details');
  await programming.locator('.pattern-evidence summary:text-is("Bayesian model details")').focus();
  await page.keyboard.press('Enter');
  assert.match(await programming.innerText(), /Observed counts.*19, 156.*0, 343/s);
  assert.match(await programming.innerText(), /Posterior mean difference:.*7.3 pp.*95% credible interval:.*selected − overall.*Beta\(20, 157\).*rest Beta\(1, 344\)/s);
  await page.getByRole('combobox', {name: 'Comparison baseline', exact: true}).selectOption('rest');
  assert.equal(await page.locator('.patterns-table tbody tr').count(), 1);
  assert.match(await programming.innerText(), /∞.*19 \/ 175.*0 \/ 343.*\+10.9 pp.*Posterior mean difference:.*11.0 pp.*selected − rest/s);
  assert.equal((await programming.locator('.pattern-evidence p strong').first().textContent()), probability);
  assert.match(await page.locator('.pattern-highlight.coverage').innerText(), /206.*vs.*625/s);
  assert.match(await page.locator('.pattern-highlight.more').innerText(), /Writing.*185 \/ 192 vs 281 \/ 580/s);
  assert.match(await page.locator('.patterns-table thead').innerText(), /Observed difference.*Advanced detail.*Robustness and model/s);
  assert(!/BH-adjusted|adj\. p|Raw p:/.test(await page.locator('.patterns-table').innerText()));
  await page.locator('.patterns-method summary').click();
  assert.match(await page.locator('.patterns-method').innerText(), /fixed observed counts have no sampling uncertainty.*independent-trials reference model/s);
  await page.locator('.patterns-method summary').click();
  await tab('Occupation map').click();
  await page.getByTestId('map-node').first().waitFor();
  await page.getByRole('searchbox', {name: 'Find on map', exact: true}).fill('nurse');
  await tab('Find an occupation').click();
  assert.equal(await page.getByRole('searchbox', {name: 'Job title', exact: true}).inputValue(), 'registered nurse');
  await page.locator('.candidate').first().waitFor();
  await tab('Skill patterns').click();
  assert.equal(await page.getByRole('searchbox', {name: 'Filter skills', exact: true}).inputValue(), 'Programming');
  assert.equal(await programming.locator('.pattern-evidence').filter({has: page.getByText('Bayesian model details', {exact:true})}).getAttribute('open'), '');
  assert.equal(await page.locator('#patterns-baseline').inputValue(), 'rest');
  await tab('Occupation map').click();
  assert.equal(await page.getByRole('searchbox', {name: 'Find on map', exact: true}).inputValue(), 'nurse');
  await tab('Occupation map').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await tab('Skill patterns').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowRight'); assert.equal(await tab('Find an occupation').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowLeft'); assert.equal(await tab('Skill patterns').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home'); assert.equal(await tab('Find an occupation').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End'); assert.equal(await tab('Skill patterns').getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByRole('tab').evaluateAll(tabs => tabs.filter(tab => tab.tabIndex === 0).length), 1);
  await page.getByRole('searchbox', {name: 'Filter skills', exact: true}).fill('zzzz-not-a-skill');
  await page.getByText('No skills match this filter. Try a broader term or clear the search.').waitFor();
  await page.getByRole('searchbox', {name: 'Filter skills', exact: true}).fill('');
  // Verify numeric sorting in both directions for each active baseline. Ratios
  // use the observed count fractions as the oracle, avoiding rounded display ties.
  for (const baseline of ['rest', 'overall']) {
    await page.locator('#patterns-baseline').selectOption(baseline);
    const label = baseline === 'overall' ? 'Overall' : 'Rest';
    for (const [column, columnLabel] of [[1, 'Prevalence ratio'], [3, label], [4, 'Observed difference']]) {
      for (const direction of ['descending', 'ascending']) {
        const header = page.locator('.patterns-table thead th').nth(column);
        if (await header.getAttribute('aria-sort') !== direction) await header.getByRole('button', {name: new RegExp(`^${columnLabel}:`)}).click();
        if (await header.getAttribute('aria-sort') !== direction) await header.getByRole('button').click();
        assert.equal(await header.getAttribute('aria-sort'), direction);
        const entries = await page.locator('.patterns-table tbody tr').evaluateAll((rows, column) => rows.map(row => {
          const cells = row.querySelectorAll('td');
          const rate = cell => {
            const [count, total] = cell.querySelector('.pattern-prevalence span').textContent.match(/\d+/g).map(Number);
            return total ? count / total : null;
          };
          const selected = rate(cells[1]), baseline = rate(cells[2]);
          const ratio = selected === null || baseline === null || selected === 0 && baseline === 0 ? null : baseline === 0 ? Infinity : selected / baseline;
          return {id: row.dataset.skillId, value: column === 1 ? ratio : column === 3 ? baseline : selected === null || baseline === null ? null : Math.abs(100 * (selected - baseline))};
        }), column);
        for (let i = 1; i < entries.length; i++) {
          const previous = entries[i - 1], current = entries[i];
          if (previous.value === null) assert.equal(current.value, null, 'Undefined values stay last');
          if (previous.value === current.value) assert(previous.id < current.id, 'Ties resolve by skill ID');
          else if (current.value !== null) assert(direction === 'descending' ? previous.value >= current.value : previous.value <= current.value, `${baseline} ${columnLabel} ${direction}`);
        }
      }
    }
  }
  // Restore the default comparison and ratio ordering for visual evidence.
  await page.getByRole('button', {name: /^Prevalence ratio:/}).click();
  const technology = page.locator('.patterns-table tbody tr').filter({has: page.locator('.pattern-skill-name', {hasText: /^Technology Design$/})});
  await technology.locator('.pattern-evidence summary:text-is("Bayesian model details")').click();
  assert.match(await technology.innerText(), /Posterior mean difference:.*2.3 pp/s);
  await technology.locator('.pattern-evidence summary:text-is("Bayesian model details")').click();
  await mkdir(out, {recursive: true});
  await page.screenshot({path: resolve(out, 'desktop.png'), fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert(await page.locator('.patterns-table-scroll').evaluate(el => el.scrollWidth > el.clientWidth));
  await page.screenshot({path: resolve(out, 'mobile.png'), fullPage: true});
  report.checks.push('Overall default, rest toggle, four categories, 35 rows, active rare counts and coverage, weighted disclosure, baseline numeric sorts both directions, search/empty filter, stable Bayesian probability and model labels, preserved tab controls, wrap/Home/End keyboard navigation, mobile horizontal scroll');

  const recovery = await browser.newPage();
  recovery.on('pageerror', error => report.errors.push(String(error)));
  recovery.on('request', request => requests.push(request.url()));
  let release; const held = new Promise(resolve => {release = resolve;});
  let attempts = 0;
  await recovery.route('**/data/skills.json', async route => {attempts++; if (attempts === 1) {await held; await route.fulfill({status: 503, body: 'Unavailable'});} else await route.continue();});
  await recovery.goto(base); await recovery.getByRole('tab', {name: 'Skill patterns', exact: true}).click();
  await recovery.getByText('Loading skill reference for patterns…').waitFor();
  release(); await recovery.getByRole('button', {name: 'Retry patterns reference', exact: true}).waitFor();
  await recovery.getByRole('tab', {name: 'Find an occupation', exact: true}).click();
  await recovery.getByRole('searchbox', {name: 'Job title', exact: true}).fill('registered nurse');
  await recovery.locator('.candidate').first().waitFor();
  await recovery.getByRole('tab', {name: 'Skill patterns', exact: true}).click();
  await recovery.locator('.patterns-table tbody tr').first().waitFor();
  assert.equal(attempts, 2);
  // A fresh failure independently exercises the visible retry control.
  attempts = 0;
  await recovery.goto(base); await recovery.getByRole('tab', {name: 'Skill patterns', exact: true}).click();
  await recovery.getByRole('button', {name: 'Retry patterns reference', exact: true}).click();
  await recovery.locator('.patterns-table tbody tr').first().waitFor();
  assert.equal(attempts, 2);
  report.checks.push('Held reference shows loading; failed reference preserves title search; reopening and visible explicit retry both recover');
  await recovery.close();

  const chunk = await browser.newPage();
  await chunk.route(/\/assets\/SkillPatterns-[^/]+\.js/, route => route.abort());
  await chunk.goto(base); await chunk.getByRole('tab', {name: 'Skill patterns', exact: true}).click();
  await chunk.getByRole('button', {name: 'Reload skill patterns', exact: true}).waitFor();
  await chunk.getByRole('tab', {name: 'Find an occupation', exact: true}).click();
  await chunk.getByRole('searchbox', {name: 'Job title', exact: true}).fill('registered nurse');
  await chunk.locator('.candidate').first().waitFor();
  await chunk.close();
  report.checks.push('Optional chunk failure contained; title search remains available');
  assert(!requests.some(url => /\/models\/|\/runtime\/|\/semantic\/|\.wasm/.test(url)));
  assert.deepEqual(report.errors, []);
  report.checks.push('No model/runtime/semantic assets or unexpected page errors');
  report.status = 'PASS';
  console.log(JSON.stringify(report));
} finally {
  await mkdir(out, {recursive: true});
  await writeFile(resolve(out, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
