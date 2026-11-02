import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { gzipSync } from 'node:zlib';
import { syntheticStdf } from './synthetic-stdf.mjs';

const url = process.env.STDF_TEST_URL || 'http://127.0.0.1:3000';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname));
const output = 'outputs/verification/workspace';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const passed = [], errors = [], failedAssets = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  if (new URL(response.url()).pathname.startsWith('/assets/') && response.status() >= 400) failedAssets.push(response.url());
});
await page.route('**/*', route => {
  const target = new URL(route.request().url());
  return ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ? route.continue() : route.abort();
});
const pass = name => { passed.push(name); console.log('PASS', name); };
const views = () => page.getByRole('navigation', { name: 'Workspace views' });
const view = name => views().getByRole('button', { name, exact: true }).click();
const load = async (name, buffer) => {
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
  await page.getByRole('status').filter({ hasText: 'parsed locally' }).waitFor();
  await page.waitForFunction(file => document.querySelector('.active-file small')?.textContent === file, name);
};
const summary = () => page.locator('.jmp-summary dl>div').evaluateAll(rows => Object.fromEntries(rows.map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent])));
try {
  assert.equal((await page.goto(url)).status(), 200);
  await page.getByRole('button', { name: 'Open STDF', exact: true }).first().waitFor();
  await load('synthetic.stdf', syntheticStdf({ parts: 128 }));
  await view('Analysis');
  const catalog = page.getByRole('table', { name: 'Parametric test catalog', exact: true });
  assert.equal(await catalog.locator('tbody tr.catalog-row').count(), 2);
  pass('built server loads JS/CSS, parses 128 synthetic parts, and displays both tests');
  const selectTest = id => catalog.getByRole('button', { name: new RegExp(`^Select test ${id}:`) });
  await selectTest(1001).click();
  let values = await summary();
  assert.ok(Object.values(values).includes('128'));
  const meanKey = Object.keys(values).find(key => /mean/i.test(key));
  assert.equal(Number(values[meanKey]), 2.5);
  await page.getByRole('combobox', { name: 'Analysis site', exact: true }).selectOption('1');
  values = await summary();
  assert.ok(Object.values(values).includes('64'));
  assert.equal(Number(values[meanKey]), 2);
  await page.getByRole('combobox', { name: 'Analysis site', exact: true }).selectOption('all');
  pass('all-site mean 2.5 and site-1 mean 2.0 match independent fixture arithmetic');
  await selectTest(1001).press('ArrowDown');
  assert.equal(await selectTest(1002).getAttribute('aria-pressed'), 'true');
  await page.getByRole('searchbox', { name: 'Search tests', exact: true }).fill('NO_MATCH');
  await page.getByRole('button', { name: 'Clear test filters', exact: true }).click();
  assert.equal(await catalog.locator('tbody tr.catalog-row').count(), 2);
  await selectTest(1001).click();
  pass('keyboard test selection and empty-search recovery');
  const chartViews = page.getByRole('group', { name: 'Chart view' });
  for (const name of ['By site', 'Sequence', 'CDF', 'Distribution']) {
    await chartViews.getByRole('button', { name, exact: true }).click();
    assert.equal(await chartViews.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true');
  }
  await page.getByRole('button', { name: /^Inspect part 1, result 1$/ }).click();
  await page.getByRole('region', { name: 'Selected die full test results' }).waitFor();
  pass('all chart views and selected-die full test results');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export results', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(`${output}/results.csv`);
  assert.ok(fs.readFileSync(`${output}/results.csv`, 'utf8').split('\n').length >= 129);
  pass('CSV export contains the loaded results');
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `overflow at ${width}`);
    await page.screenshot({ path: `${output}/analysis-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  pass('desktop/tablet/mobile analysis has no page overflow');
  await load('second.stdf.gz', gzipSync(syntheticStdf({ parts: 128 })));
  await view('Compare');
  assert.equal(await page.locator('.comparison-test-link').count(), 2);
  const summaryRows = page.locator('.comparison-table').first().locator('tbody tr');
  assert.equal(await summaryRows.count(), 2);
  await page.getByText('Advanced · matched-die correlation', { exact: true }).click();
  assert.match(await page.locator('.comparison-correlation').innerText(), /Both runs need recorded lot and wafer IDs/); assert.equal(await page.locator('.correlation-kpis').count(), 0);
  pass('gzip loading, two-run summaries, and rejection of unidentifiable die pairing');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'broken.stdf', mimeType: 'application/octet-stream', buffer: Buffer.from([2, 0, 0, 10, 2, 3]) });
  await page.getByRole('alert').filter({ hasText: 'Unsupported STDF version' }).waitFor();
  assert.equal(await summaryRows.count(), 2);
  pass('malformed file is rejected without losing the current comparison');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Run options', exact: true }).click();
  await page.getByRole('button', { name: 'Clear workspace', exact: true }).click();
  await page.locator('.empty-panel').waitFor();
  await load('reopened.stdf', syntheticStdf());
  pass('clear workspace and reopen a new file');
  assert.deepEqual(errors, []);
  assert.deepEqual(failedAssets, []);
  pass('no browser runtime errors or failed application assets');
} finally {
  fs.writeFileSync(`${output}/results.json`, JSON.stringify({ url, passed, errors, failedAssets }, null, 2));
  await browser.close();
}
