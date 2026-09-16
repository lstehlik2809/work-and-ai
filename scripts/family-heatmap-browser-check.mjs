import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {returningVisitor} from './returning-visitor.mjs';

const base = process.env.TEST_URL || 'http://127.0.0.1:4173/work-and-ai/';
const out = resolve(process.env.OUTPUT_DIR || 'verification/local/family-heatmap');
const snapshot = JSON.parse(await readFile('public/data/occupations.json', 'utf8'));
const skills = JSON.parse(await readFile('public/data/skills.json', 'utf8'));
const levels = ['Low', 'Moderate', 'High', 'Very high'];
const ratings = new Map(skills.roles.map(role => [role.code, role.importance]));
const eligible = occupation => skills.skills.filter((_, i) => occupation.roles.some(role => ratings.get(role.code)?.[i] != null)).length >= 20;
const expectedCodes = (family, exposure, population = snapshot.occupations) => population.filter(o => eligible(o) && o.code.startsWith(family + '-') && o.exposure === exposure).map(o => o.code).sort();
const browser = await chromium.launch({headless: true});
const report = {base, checks: [], errors: []};
const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
page.on('pageerror', error => report.errors.push(String(error)));
const mode = (target, name) => target.getByRole('group', {name: 'Occupation view', exact: true}).getByRole('button', {name, exact: true});
const table = target => target.getByTestId('family-exposure-heatmap');
const cell = (target, family, exposure) => table(target).locator(`tr[data-family="${family}"] td[data-exposure="${exposure}"]`);
const codes = target => target.getByTestId('map-node').evaluateAll(nodes => nodes.map(node => node.dataset.code).sort());
async function assertVisibleFocus(target) {
  assert(await target.evaluate(() => {
    const element = document.activeElement, rect = element.getBoundingClientRect();
    return element !== document.body && rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0;
  }), 'focused drilldown destination must intersect viewport');
}
async function openMap(target) {
  await returningVisitor(target);
  await target.goto(base);
  await target.getByRole('tab', {name: 'Occupation map', exact: true}).click();
}
async function validateMatrix(target, population) {
  const rows = table(target).locator('tbody tr[data-family]');
  const families = [...new Set(population.map(o => o.code.slice(0, 2)))];
  assert.equal(await rows.count(), families.length);
  const categories = population.some(o => o.exposure === null) ? [...levels, 'Unavailable'] : levels;
  let total = 0;
  const ranking = [];
  for (const family of families) {
    const occupations = population.filter(o => o.code.startsWith(family + '-'));
    let rowTotal = 0;
    for (const category of categories) {
      const count = occupations.filter(o => (o.exposure ?? 'Unavailable') === category).length;
      const targetCell = cell(target, family, category);
      assert.equal(await targetCell.getAttribute('data-count'), String(count));
      assert.equal(await targetCell.getAttribute('data-total'), String(occupations.length));
      assert((await targetCell.innerText()).includes((100 * count / occupations.length).toFixed(1) + '%'), `${family}/${category} percentage`);
      if (!count) assert.equal(await targetCell.locator('button:not([disabled])').count(), 0, 'empty cells cannot drill down');
      rowTotal += count;
    }
    assert.equal(rowTotal, occupations.length);
    total += rowTotal;
    ranking.push([family, occupations.filter(o => o.exposure === 'High' || o.exposure === 'Very high').length / occupations.length]);
  }
  assert.equal(total, population.length);
  const renderedOrder = await rows.evaluateAll(nodes => nodes.map(node => node.dataset.family));
  const shares = renderedOrder.map(family => ranking.find(row => row[0] === family)[1]);
  assert(shares.every((share, i) => i === 0 || share <= shares[i - 1]), 'default order is descending High + Very high share');
}

try {
  await mkdir(out, {recursive: true});
  await openMap(page);
  await page.getByTestId('map-node').first().waitFor();
  assert.equal(await mode(page, 'Map').getAttribute('aria-pressed'), 'true');
  const positions = await page.getByTestId('map-node').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.dataset.code, [node.dataset.x, node.dataset.y]])));
  const familyFilter = page.getByRole('combobox', {name: 'Job family', exact: true});
  const exposureFilters = page.getByRole('group', {name: 'AI exposure', exact: true});
  const search = page.getByRole('searchbox', {name: 'Highlight on map', exact: true});
  await familyFilter.selectOption('15');
  await exposureFilters.getByRole('button', {name: 'Very high', exact: true}).click();
  await search.fill('computer programmers');
  await page.getByTestId('map-list-occupation').first().click();
  const oldView = await page.getByTestId('occupation-map').getAttribute('viewBox');
  await mode(page, 'By job family').click();
  assert.equal(await page.getByTestId('occupation-map').isVisible(), false);
  assert.equal(await page.getByTestId('map-selection').isVisible(), false);
  assert.equal(await table(page).isVisible(), true);
  await validateMatrix(page, snapshot.occupations);
  report.checks.push('All 831 occupations across 22 families; all cell counts, within-family percentages, zero cells and default ordering verified against source snapshot');
  const contrast = await table(page).locator('td button').evaluateAll(buttons => {
    const ctx = document.createElement('canvas').getContext('2d');
    const luminance = color => {
      ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => {
        const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
      }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    };
    return buttons.flatMap(button => ['strong', 'small'].map(selector => {
      const text = luminance(getComputedStyle(button.querySelector(selector)).color);
      const background = luminance(getComputedStyle(button).backgroundColor);
      return (Math.max(text, background) + .05) / (Math.min(text, background) + .05);
    }));
  });
  assert(Math.min(...contrast) >= 4.5, `cell text contrast: ${Math.min(...contrast)}`);
  report.minimumCellContrast = Math.min(...contrast);
  const sort = page.getByRole('combobox', {name: 'Order families', exact: true});
  await sort.selectOption('name');
  const familyNames = await table(page).locator('tbody th').evaluateAll(nodes => nodes.map(node => node.firstChild.textContent));
  assert.deepEqual(familyNames, [...familyNames].sort((a, b) => a.localeCompare(b)));
  await sort.selectOption('share');
  report.checks.push('Alphabetical ordering and cell percentage/count text contrast');
  await page.locator('#map-view').screenshot({path: resolve(out, 'desktop.png')});
  await mode(page, 'Map').click();
  assert.equal(await familyFilter.inputValue(), '15');
  assert.equal(await search.inputValue(), 'computer programmers');
  assert.equal(await exposureFilters.getByRole('button', {name: 'Very high', exact: true}).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByTestId('occupation-map').getAttribute('viewBox'), oldView);
  assert.equal(await page.locator('[data-testid="map-node"][aria-pressed="true"]').getAttribute('data-code'), '15-1251');
  report.checks.push('Ordinary switching preserves search, filters, selection and zoom; heatmap remains independent of map filters');

  await mode(page, 'By job family').click();
  await cell(page, '13', 'Very high').getByRole('button').focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('occupation-map').waitFor({state: 'visible'});
  assert.equal(await mode(page, 'Map').getAttribute('aria-pressed'), 'true');
  assert.equal(await familyFilter.inputValue(), '13');
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.locator('[data-testid="map-node"][aria-pressed="true"]').count(), 0);
  assert.deepEqual(await codes(page), expectedCodes('13', 'Very high'));
  const notice = await page.getByTestId('family-drilldown-notice').innerText();
  assert.match(notice, /26/); assert.match(notice, /24/);
  await assertVisibleFocus(page);
  for (const [code, point] of await page.getByTestId('map-node').evaluateAll(nodes => nodes.map(node => [node.dataset.code, [node.dataset.x, node.dataset.y]]))) assert.deepEqual(point, positions[code]);
  await familyFilter.selectOption('29');
  await mode(page, 'By job family').click();
  await cell(page, '13', 'Very high').getByRole('button').click();
  assert.equal(await familyFilter.inputValue(), '13', 'repeated drilldown into same cell reapplies filters');
  assert.deepEqual(await codes(page), expectedCodes('13', 'Very high'));
  report.checks.push('Keyboard and repeated cell drilldown apply exact filters, clear prior search/selection, preserve positions and explain 26 snapshot versus 24 mapped occupations');

  await mode(page, 'By job family').click();
  await page.setViewportSize({width: 390, height: 844});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no mobile document overflow');
  await page.locator('#map-view').screenshot({path: resolve(out, 'mobile.png')});
  await cell(page, '15', 'Very high').getByRole('button').click();
  assert.equal(await familyFilter.inputValue(), '15');
  assert.deepEqual(await codes(page), expectedCodes('15', 'Very high'));
  report.checks.push('390px layout and mobile cell navigation');

  for (const viewport of [{width: 390, height: 844}, {width: 1440, height: 1100}]) {
    await page.setViewportSize(viewport);
    await mode(page, 'By job family').click();
    const lastRow = cell(page, '45', 'Low').getByRole('button');
    await lastRow.scrollIntoViewIfNeeded(); await lastRow.focus(); await page.keyboard.press('Enter');
    await assertVisibleFocus(page);
    assert.deepEqual(await codes(page), expectedCodes('45', 'Low'));
  }
  report.checks.push('Lower-row keyboard drilldown reveals focused destination on desktop and mobile');

  await mode(page, 'By job family').click();
  await page.getByRole('button', {name: 'Take a tour', exact: true}).click();
  for (let i = 0; i < 4; i++) await page.getByRole('dialog').getByRole('button', {name: 'Next', exact: true}).click();
  await page.waitForFunction(() => {
    const spotlight = document.querySelector('.tour-spotlight');
    const target = spotlight?.dataset.target && document.querySelector(spotlight.dataset.target);
    return target?.classList.contains('family-heatmap-scroll') && target.getBoundingClientRect().width > 0 && spotlight.getBoundingClientRect().height > 0;
  });
  await page.keyboard.press('Escape');
  assert.equal(await mode(page, 'By job family').getAttribute('aria-pressed'), 'true');
  report.checks.push('Tour replay highlights the visible heatmap and preserves its selected view');

  const failure = await browser.newPage();
  try {
    await failure.route('**/data/occupation-map-umap.json', route => route.fulfill({status: 503, body: 'Unavailable'}));
    await openMap(failure);
    await failure.getByRole('button', {name: 'Retry UMAP layout', exact: true}).waitFor();
    await mode(failure, 'By job family').click();
    await validateMatrix(failure, snapshot.occupations);
    await cell(failure, '45', 'Low').getByRole('button').click();
    await assertVisibleFocus(failure);
    report.checks.push('Heatmap remains usable after map projection failure');
  } finally { await failure.close(); }

  const missing = await browser.newPage();
  try {
    const fixture = structuredClone(snapshot);
    const occupation = fixture.occupations.find(o => !eligible(o));
    occupation.exposure = null;
    const family = occupation.code.slice(0, 2);
    await missing.route('**/data/occupations.json', route => route.fulfill({json: fixture}));
    await openMap(missing);
    await missing.getByTestId('map-node').first().waitFor();
    await mode(missing, 'By job family').click();
    await validateMatrix(missing, fixture.occupations);
    await cell(missing, family, 'Unavailable').getByRole('button').click();
    assert.equal(await missing.getByTestId('map-node').count(), 0);
    assert(await missing.locator('.map-empty').isVisible());
    const emptyNotice = await missing.getByTestId('family-drilldown-notice').innerText();
    assert.match(emptyNotice, /\b1\b/); assert.match(emptyNotice, /\b0\b/);
    report.checks.push('Synthetic missing exposure remains in denominator, gets separate column, and zero-map-coverage drilldown explains the difference');
  } finally { await missing.close(); }
  assert.deepEqual(report.errors, []);
  report.status = 'PASS';
  console.log(JSON.stringify(report));
} catch (error) {
  report.status = 'FAIL';
  report.failure = String(error);
  throw error;
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
