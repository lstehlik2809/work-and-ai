import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const base = process.env.TEST_URL || 'http://127.0.0.1:4175/work-and-ai/';
const snapshot = JSON.parse(await readFile('public/data/occupations.json', 'utf8'));
const skills = JSON.parse(await readFile('public/data/skills.json', 'utf8'));
const roles = new Map(skills.roles.map(role => [role.code, role.importance]));
// Independent oracle from source ratings, including missing values and role aggregation.
function expectedCodes(skillName, categories = []) {
  const index = skills.skills.findIndex(skill => skill.name === skillName);
  assert(index >= 0);
  return snapshot.occupations.filter(occupation => {
    if (categories.length && !categories.includes(occupation.exposure)) return false;
    const ratings = [...new Set(occupation.roles.map(role => role.code))]
      .map(code => roles.get(code)?.[index]).filter(value => value !== undefined && value !== null);
    return ratings.length > 0 && ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length >= 3;
  }).map(occupation => occupation.code).sort();
}
const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1100}});
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(base);
  await page.getByRole('tab', {name: 'Occupation map', exact: true}).click();
  await page.getByTestId('map-node').first().waitFor();
  const search = page.getByRole('searchbox', {name: 'Highlight on map', exact: true});
  const suggestions = page.getByRole('region', {name: 'Highlight on map suggestions'});
  const exposure = page.getByRole('group', {name: 'AI exposure', exact: true});
  const category = label => exposure.getByRole('button', {name: label, exact: true});
  const highlighted = () => page.getByTestId('map-highlight').evaluateAll(nodes => nodes.map(node => node.dataset.code).sort());
  const listed = () => page.getByTestId('map-list-occupation').evaluateAll(nodes => nodes.map(node => node.dataset.code).sort());
  const positions = () => page.getByTestId('map-node').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.dataset.code, [node.dataset.x, node.dataset.y, node.getAttribute('fill')]])));
  const original = await positions();
  await search.fill('program');
  await suggestions.getByRole('button', {name: 'Skill Programming', exact: true}).waitFor();
  assert(await suggestions.getByRole('button', {name: /Occupation.*Computer programmers/i}).count());
  // Native Tab/Enter must select a skill without requiring a pointer.
  await search.press('Tab'); // Clear search
  await page.keyboard.press('Tab'); // First skill suggestion
  assert.match(await page.locator(':focus').innerText(), /Skill\s+Programming/);
  await page.keyboard.press('Enter');
  assert.equal(await search.inputValue(), 'Programming');
  assert.equal(await suggestions.count(), 0);
  assert.deepEqual(await highlighted(), expectedCodes('Programming'));
  assert.deepEqual(await listed(), expectedCodes('Programming'));
  assert.deepEqual(await positions(), original);
  assert.match(await page.locator('.map-visible-count').innerText(), new RegExp(`Programming is important in ${expectedCodes('Programming').length} occupations`));
  await page.waitForFunction(() => {
    const svg = document.querySelector('[data-testid="occupation-map"]');
    const [x, y, w, h] = svg.getAttribute('viewBox').split(' ').map(Number);
    return [...svg.querySelectorAll('[data-search-match="true"]')].every(node => +node.getAttribute('cx') >= x && +node.getAttribute('cx') <= x + w && +node.getAttribute('cy') >= y && +node.getAttribute('cy') <= y + h);
  });
  await category('Very high').click();
  assert.deepEqual(await highlighted(), expectedCodes('Programming', ['Very high']));
  await category('High').click();
  assert.deepEqual(await highlighted(), expectedCodes('Programming', ['High', 'Very high']));
  await category('All').click();
  await category('Unavailable').click();
  assert.deepEqual(await highlighted(), []);
  assert.match(await page.locator('.map-visible-count').innerText(), /Programming is important in 0 occupations within Unavailable/);
  await category('All').click();
  // Editing clears skill mode and preserves ordinary substring title matching.
  await search.fill('engineer');
  assert.equal(await page.locator('.map-search-selected').count(), 0);
  assert.deepEqual(await highlighted(), Object.keys(original).filter(code => {
    const occupation = snapshot.occupations.find(item => item.code === code);
    return `${occupation.title} ${code}`.toLowerCase().includes('engineer');
  }).sort());
  await search.fill('15-1251');
  await suggestions.getByRole('button', {name: /Occupation.*Computer programmers/i}).click();
  assert.deepEqual(await highlighted(), ['15-1251']);
  await page.getByRole('button', {name: 'Clear search', exact: true}).click();
  assert.deepEqual(await highlighted(), []);
  assert.equal(await listed().then(codes => codes.length), Object.keys(original).length);
  await search.fill('no such skill zzz');
  assert.deepEqual(await highlighted(), []);
  await search.press('Escape');
  assert.equal(await suggestions.count(), 0);
  // Check every skill against the source-derived oracle, catching sparse/missing ratings.
  for (const skill of skills.skills) {
    await search.fill(skill.name);
    await suggestions.getByRole('button', {name: `Skill ${skill.name}`, exact: true}).click();
    assert.deepEqual(await highlighted(), expectedCodes(skill.name), skill.name);
    assert.deepEqual(await listed(), expectedCodes(skill.name), skill.name);
  }
  await page.setViewportSize({width: 390, height: 844});
  await search.fill('program');
  await suggestions.getByRole('button', {name: 'Skill Programming', exact: true}).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mkdir('verification/local/map-skill-search', {recursive: true});
  await page.locator('.map-filters').screenshot({path: 'verification/local/map-skill-search/mobile.png'});
  await page.setViewportSize({width: 1440, height: 1100});
  await page.locator('.occupation-map-section').screenshot({path: 'verification/local/map-skill-search/desktop.png'});
  assert.deepEqual(errors, []);
  console.log('PASS: all 35 skill match sets and lists; keyboard selection; exposure unions and empty results; title/code fallback; clearing; fixed positions/colors; framing; mobile width; no browser errors.');
} finally {
  await browser.close();
}
