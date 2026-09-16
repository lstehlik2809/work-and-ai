import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {returningVisitor} from './returning-visitor.mjs';

const base = process.env.TEST_URL || 'http://127.0.0.1:4173/work-and-ai/';
const out = resolve(process.env.OUTPUT_DIR || 'verification/local/family-members');
const snapshot = JSON.parse(await readFile('public/data/occupations.json', 'utf8'));
const skills = JSON.parse(await readFile('public/data/skills.json', 'utf8'));
const ratings = new Map(skills.roles.map(role => [role.code, role.importance]));
const eligible = o => skills.skills.filter((_, i) => o.roles.some(role => ratings.get(role.code)?.[i] != null)).length >= 20;
const names = {'11':'Management','13':'Business and Financial Operations','15':'Computer and Mathematical','17':'Architecture and Engineering','19':'Life, Physical, and Social Science','21':'Community and Social Service','23':'Legal','25':'Educational Instruction and Library','27':'Arts, Design, Entertainment, Sports, and Media','29':'Healthcare Practitioners and Technical','31':'Healthcare Support','33':'Protective Service','35':'Food Preparation and Serving Related','37':'Building and Grounds Cleaning and Maintenance','39':'Personal Care and Service','41':'Sales and Related','43':'Office and Administrative Support','45':'Farming, Fishing, and Forestry','47':'Construction and Extraction','49':'Installation, Maintenance, and Repair','51':'Production','53':'Transportation and Material Moving'};
const familyName = code => names[code.slice(0, 2)];
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
const report = {base, checks: [], errors: []};
page.on('pageerror', error => report.errors.push(String(error)));
const panel = () => page.getByTestId('family-members-panel');
const members = () => panel().getByTestId('family-member');
const search = () => panel().getByRole('searchbox', {name: 'Search family occupations', exact: true});
const trigger = family => page.locator(`[data-testid="family-members-trigger"][data-family="${family}"]`);
const view = name => page.getByRole('group', {name: 'Occupation view', exact: true}).getByRole('button', {name, exact: true});
const position = () => page.evaluate(() => ({x:scrollX, y:scrollY, table:document.querySelector('.family-heatmap-scroll').scrollLeft}));
async function closePanel(family, method = 'button') {
  if (method === 'escape') await page.keyboard.press('Escape');
  else await panel().getByRole('button', {name: 'Close family occupations', exact: true}).click();
  await panel().waitFor({state: 'hidden'});
  assert.equal(await trigger(family).evaluate(el => el === document.activeElement), true);
}

try {
  await mkdir(out, {recursive: true});
  await returningVisitor(page); await page.goto(base);
  await page.getByRole('tab', {name:'Occupation map', exact:true}).click();
  await page.getByTestId('map-node').first().waitFor();
  const tooltips = await page.getByTestId('map-node').evaluateAll(nodes => nodes.map(node => ({code:node.dataset.code, title:node.querySelector('title').textContent, label:node.getAttribute('aria-label')})));
  for (const node of tooltips) {
    assert(node.title.includes(familyName(node.code)), `${node.code} tooltip family`);
    assert(node.label.includes(familyName(node.code)), `${node.code} accessible family`);
  }
  for (const code of ['29-1141', '15-1251', '11-1011']) {
    const node = page.locator(`[data-testid="map-node"][data-code="${code}"]`);
    await node.focus(); await page.keyboard.press('Enter');
    assert((await page.getByTestId('map-selection-family').innerText()).includes(familyName(code)));
    const neighbors = page.getByTestId('map-neighbors').locator('ol > li');
    assert.equal(await neighbors.count(), 5);
    for (const neighbor of await neighbors.all()) {
      const neighborCode = await neighbor.getAttribute('data-code');
      assert((await neighbor.getByTestId('map-neighbor-family').innerText()).includes(familyName(neighborCode)));
    }
  }
  await page.getByRole('button', {name:'View occupation details', exact:true}).click();
  await page.waitForFunction(() => document.activeElement?.id === 'occupation-heading');
  assert((await page.getByTestId('occupation-family').innerText()).includes('Management'));
  await page.getByRole('searchbox', {name:'Job title', exact:true}).fill('registered nurse');
  await page.locator('button.candidate').first().click();
  assert((await page.getByTestId('occupation-family').innerText()).includes('Healthcare Practitioners and Technical'));
  report.checks.push('Every mapped occupation tooltip/accessibility label has its family; three selections and all closest matches show their own family; first-tab details cover map and direct search');

  await page.getByRole('tab', {name:'Occupation map', exact:true}).click();
  await view('By job family').click();
  const families = await page.getByTestId('family-members-trigger').evaluateAll(nodes => nodes.map(node => node.dataset.family));
  assert.equal(families.length, 22);
  let count = 0;
  for (const family of families) {
    await trigger(family).scrollIntoViewIfNeeded();
    const before = await position();
    await trigger(family).click();
    await panel().waitFor();
    const expected = snapshot.occupations.filter(o => o.code.startsWith(family + '-')).sort((a, b) => a.title.localeCompare(b.title) || a.code.localeCompare(b.code));
    assert((await panel().getByRole('heading').first().innerText()).includes(names[family]));
    const actual = await members().evaluateAll(nodes => nodes.map(node => ({code:node.dataset.code, text:node.textContent})));
    assert.deepEqual(actual.map(o => o.code), expected.map(o => o.code), `${names[family]} membership and alphabetical order`);
    for (const [i, occupation] of expected.entries()) {
      assert(actual[i].text.includes(occupation.title));
      assert(actual[i].text.includes(occupation.exposure ?? 'Unavailable'));
    }
    count += actual.length;
    await closePanel(family);
    const after = await position();
    assert(Math.abs(before.y - after.y) <= 2, 'closing restores document position');
    assert.equal(after.table, before.table, 'closing retains table position');
  }
  assert.equal(count, 831);
  report.checks.push('All 22 family drawers contain all 831 source occupations once, alphabetical with exposure labels; closing returns focus and preserves heatmap position');

  await trigger('51').click();
  assert.equal(await members().count(), 105);
  await search().fill('nonexistent-zzzz'); assert.equal(await members().count(), 0);
  assert.match(await panel().innerText(), /no .*occupations/i);
  await search().fill('51-1011'); assert.equal(await members().count(), 1);
  await search().fill(''); assert.equal(await members().count(), 105);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press(i < 5 ? 'Shift+Tab' : 'Tab');
    assert(await panel().evaluate(el => el.contains(document.activeElement)), 'keyboard stays inside dialog');
  }
  await members().last().scrollIntoViewIfNeeded();
  const closeBounds = await panel().getByRole('button', {name:'Close family occupations', exact:true}).boundingBox();
  assert(closeBounds.y >= 0 && closeBounds.y + closeBounds.height <= 1100, 'close remains visible while list scrolls');
  await page.screenshot({path:resolve(out, 'desktop.png')});
  await closePanel('51', 'escape');
  report.checks.push('Largest family search, code lookup, empty result, keyboard trap and persistent close control');

  const unmapped = snapshot.occupations.find(o => !eligible(o));
  await trigger(unmapped.code.slice(0,2)).click();
  await panel().locator(`[data-testid="family-member"][data-code="${unmapped.code}"]`).click();
  await panel().waitFor({state:'hidden'});
  await page.waitForFunction(() => document.activeElement?.id === 'occupation-heading');
  assert.equal(await page.locator('#occupation-heading').innerText(), unmapped.title);
  assert((await page.getByTestId('occupation-family').innerText()).includes(familyName(unmapped.code)));
  report.checks.push('An occupation excluded from the skill map can open first-tab details from its family; destination focus is preserved');

  await page.getByRole('tab', {name:'Occupation map', exact:true}).click();
  await page.setViewportSize({width:390, height:844});
  await trigger('37').click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const bounds = await panel().boundingBox();
  assert(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.width >= 380, 'drawer is full-width on mobile');
  await page.screenshot({path:resolve(out, 'mobile.png')});
  await closePanel('37');
  await trigger('15').click();
  await search().fill('programmer');
  assert.equal(await members().count(), 1);
  await members().first().click();
  await page.waitForFunction(() => document.activeElement?.id === 'occupation-heading');
  assert((await page.getByTestId('occupation-family').innerText()).includes('Computer and Mathematical'));
  report.checks.push('Mobile full-width drawer, close and search-to-detail navigation');
  assert.deepEqual(report.errors, []);
  report.status = 'PASS';
  console.log(JSON.stringify(report));
} catch (error) {
  report.status = 'FAIL'; report.failure = String(error); throw error;
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
