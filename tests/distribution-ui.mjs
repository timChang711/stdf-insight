import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { syntheticStdf } from './synthetic-stdf.mjs';

// These browser checks generate every record in memory; no customer data is read.
const url = process.env.STDF_TEST_URL || 'http://127.0.0.1:5175';
const isLoopback = value => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);
assert.ok(isLoopback(url), 'Distribution UI tests require a loopback URL');
const output = path.resolve('outputs/distribution');
fs.mkdirSync(output, { recursive: true });

// Reuse the generated STDF record structure while supplying independent known R*4 data.
function fixture(values, limits = [5.6, 6]) {
  const buffer = syntheticStdf({ parts: values.length });
  const counts = new Map();
  for (let offset = 0; offset < buffer.length;) {
    const length = buffer.readUInt16LE(offset), body = offset + 4;
    if (buffer[offset + 2] === 15 && buffer[offset + 3] === 10) {
      const id = buffer.readUInt32LE(body), index = counts.get(id) || 0;
      counts.set(id, index + 1);
      buffer.writeFloatLE(id === 1001 ? values[index] : (index % 5 + 1) * 1e-10, body + 8);
      if (id === 1001 && !Number.isFinite(values[index])) buffer[body + 6] = 128;
      if (length > 12) {
        let option = body + 12;
        option += 1 + buffer[option]; // TEST_TXT
        option += 1 + buffer[option]; // ALARM_ID
        buffer.writeFloatLE(id === 1001 ? limits[0] : 1e-10, option + 4);
        buffer.writeFloatLE(id === 1001 ? limits[1] : 5e-10, option + 8);
      }
    }
    offset = body + length;
  }
  return buffer;
}

// Independent Welford reference over exactly the values encoded in STDF R*4.
function reference(values, limits = [5.6, 6]) {
  const encoded = values.map(Math.fround).filter(Number.isFinite);
  let n = 0, mean = 0, m2 = 0;
  for (const value of encoded) {
    n++;
    const delta = value - mean;
    mean += delta / n;
    m2 += delta * (value - mean);
  }
  const sigma = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;
  const sorted = [...encoded].sort((a, b) => a - b), middle = (n - 1) / 2;
  const [low, high] = limits.map(Math.fround);
  return {
    'Numeric N': n, Mean: mean, 'Std Dev (sample)': sigma,
    Median: (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2,
    Minimum: sorted[0], Maximum: sorted.at(-1),
    Cpk: Math.min((high - mean) / (3 * sigma), (mean - low) / (3 * sigma)),
    'Fail %': encoded.filter(value => value < low || value > high).length / values.length * 100,
  };
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const errors = [], externalRequests = [], passed = [], screenshots = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  const requestUrl = route.request().url();
  if (/^https?:/.test(requestUrl) && !isLoopback(requestUrl)) {
    externalRequests.push(requestUrl);
    await route.abort();
  } else await route.continue();
});
const pass = label => { passed.push(label); console.log('PASS', label); };
const workspace = () => page.locator('.distribution-workspace');
const field = name => workspace().getByRole('spinbutton', { name, exact: true, includeHidden: true });
const low = () => field('Distribution x-axis minimum');
const high = () => field('Distribution x-axis maximum');
const width = () => field('Histogram bin width');
const density = () => workspace().getByRole('slider', { name: 'Histogram bar count', exact: true });
const button = name => workspace().getByRole('button', { name, exact: true });
const bars = () => workspace().locator('.jmp-hist-bar');
const binSnapshot = () => bars().evaluateAll(items => items.map(item => ({
  from: Number(item.getAttribute('data-from')), to: Number(item.getAttribute('data-to')),
  count: Number(item.getAttribute('data-count')),
})));
const summary = () => workspace().locator('.jmp-summary dl > div').evaluateAll(items => Object.fromEntries(
  items.map(item => [item.querySelector('dt').textContent, item.querySelector('dd').textContent]),
));
const openAdvanced = async () => {
  if (await workspace().locator('.distribution-advanced').getAttribute('open') === null) {
    await workspace().getByText('Advanced settings', { exact: true }).click();
  }
};
const openDistribution = async () => {
  await page.getByRole('button', { name: 'Distribution', exact: true }).click();
  await workspace().waitFor();
  await openAdvanced();
};
const load = async (name, values, limits) => {
  await page.locator('input[type=file]').first().setInputFiles({
    name, mimeType: 'application/octet-stream', buffer: fixture(values, limits),
  });
  await page.getByRole('status').filter({ hasText: 'parsed locally' }).waitFor();
  await page.waitForFunction(fileName => document.querySelector('.active-file small')?.textContent === fileName, name);
  await page.getByRole('button', { name: 'Test explorer' }).click();
  await workspace().waitFor();
};
const expectCount = async (shown, numeric = shown) => {
  await page.waitForFunction(({ shown, numeric }) => {
    const text = document.querySelector('.distribution-population b')?.textContent.replaceAll(',', '');
    const plot = document.querySelector('.jmp-distribution-body svg')?.getAttribute('aria-label');
    return text === `${numeric} numeric records` && plot?.endsWith(`; ${shown} records shown`);
  }, { shown, numeric });
  // Cropping changes visibility only: every finite record remains in the bins.
  assert.equal((await binSnapshot()).reduce((sum, item) => sum + item.count, 0), numeric);
};
const expectStats = async values => {
  const actual = await summary(), expected = reference(values);
  for (const [label, value] of Object.entries(expected)) {
    const displayed = Number(actual[label].replaceAll(',', ''));
    assert.ok(Math.abs(displayed - value) <= Math.max(Math.abs(value) * 7e-7, 1e-13), `${label}: ${displayed} vs independent reference ${value}`);
  }
};
const apply = async () => {
  assert.equal(await button('Apply').isEnabled(), true);
  await button('Apply').click();
  await workspace().locator('.distribution-pending').waitFor({ state: 'detached' });
};

try {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  // Binary-exact endpoints and spacing keep the independent bin-edge checks
  // separate from STDF R*4 display rounding.
  const values = Array.from({ length: 21 }, (_, index) => 5.625 + index / 64);
  await load('synthetic-distribution.stdf', values);
  await expectCount(21);
  await expectStats(values);
  assert.equal(await density().inputValue(), '50');
  assert.equal(await density().getAttribute('min'), '20');
  assert.equal(await density().getAttribute('max'), '100');
  assert.equal(await bars().count(), 50);
  assert.equal(await low().isVisible(), false);
  assert.equal(await field('Distribution x-axis tick interval').count(), 0);
  pass('50 data-based bins by default, a 20-100 slider, and advanced controls collapsed; statistics match independent arithmetic');

  const original = await binSnapshot(), originalStats = await summary();
  await density().focus();
  await density().press('End');
  assert.equal(await density().inputValue(), '100');
  assert.equal(await bars().count(), 100);
  await expectCount(21);
  assert.deepEqual(await summary(), originalStats);
  assert.equal(await workspace().locator('.distribution-pending').count(), 0);
  const dense = await binSnapshot();
  await button('Show specs').click();
  assert.deepEqual(await binSnapshot(), dense);
  assert.deepEqual(await summary(), originalStats);
  assert.equal(await workspace().locator('.limit-label').count(), 2);
  await button('Fit data').click();
  assert.deepEqual(await binSnapshot(), dense);
  assert.deepEqual(await summary(), originalStats);
  await density().focus();
  await density().press('Home');
  assert.equal(await density().inputValue(), '20');
  assert.equal(await bars().count(), 20);
  assert.deepEqual(await summary(), originalStats);
  pass('slider immediately changes density; Fit data and Show specs preserve every bin boundary, count and statistic');

  await workspace().getByText('Advanced settings', { exact: true }).click();
  await button('Reset').click();
  assert.equal(await density().inputValue(), '50');
  assert.deepEqual(await binSnapshot(), original);
  assert.equal(await low().isVisible(), true);
  await width().fill('0.0625');
  assert.deepEqual(await binSnapshot(), original);
  assert.match(await workspace().locator('.distribution-pending').innerText(), /Apply or Enter/);
  await apply();
  assert.equal(await bars().count(), 5);
  assert.deepEqual(await summary(), originalStats);
  await width().fill('0.03125');
  assert.equal(await bars().count(), 5);
  await width().press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.jmp-hist-bar').length === 10);
  await expectCount(21);
  assert.deepEqual((await binSnapshot()).map(item => item.count), [...Array(9).fill(2), 3]);
  assert.match(await bars().first().locator('title').textContent(), /^\[5\.625, 5\.65625\)/);
  assert.match(await bars().last().locator('title').textContent(), /^\[5\.90625, 5\.9375\]/);
  pass('Apply and Enter commit staged width; binary-exact data has 10 bins with correct edge membership');

  const committed = await binSnapshot();
  for (const invalid of ['0', '-0.02', '0.000001']) {
    await width().fill(invalid);
    assert.equal(await button('Apply').isDisabled(), true);
    assert.match(await workspace().locator('.distribution-scale-error').innerText(), /Bin width/);
    assert.deepEqual(await binSnapshot(), committed);
  }
  await button('Discard edits').click();
  assert.equal(await width().inputValue(), '0.03125');
  assert.equal(await workspace().locator('.distribution-scale-error').count(), 0);
  assert.deepEqual(await binSnapshot(), committed);
  pass('Discard edits removes an invalid draft while preserving the last applied settings and counts');
  await low().fill('7');
  await high().fill('6');
  assert.equal(await button('Apply').isDisabled(), true);
  assert.match(await workspace().locator('.distribution-scale-error').innerText(), /X Max/);
  assert.deepEqual(await binSnapshot(), committed);
  await high().fill('7');
  assert.equal(await button('Apply').isDisabled(), true);
  await button('Reset').click();
  for (const input of [low(), high(), width()]) assert.equal(await input.inputValue(), '');
  assert.equal(await workspace().locator('.distribution-scale-error').count(), 0);
  assert.equal(await button('Apply').isDisabled(), true);
  assert.deepEqual(await binSnapshot(), original);
  assert.equal(await density().inputValue(), '50');
  pass('invalid widths and reversed/equal bounds never change the chart; Reset restores automatic viewport and density 50');

  await low().pressSequentially('-');
  assert.equal(await low().evaluate(input => input.validity.badInput), true);
  assert.equal(await button('Apply').isDisabled(), true);
  await button('Discard edits').click();
  assert.equal(await low().evaluate(input => input.validity.badInput), false);
  assert.equal(await workspace().locator('.distribution-scale-error').count(), 0);
  await low().pressSequentially('-');
  assert.equal(await button('Reset').isEnabled(), true);
  await button('Reset').click();
  assert.equal(await low().evaluate(input => input.validity.badInput), false);
  assert.deepEqual(await binSnapshot(), original);
  pass('unfinished input from an automatic field can be discarded or reset without changing the chart');

  await low().fill('5.703125');
  await high().fill('5.859375');
  await width().fill('0.03125');
  await apply();
  await expectCount(11, 21);
  assert.match(await workspace().locator('.distribution-exclusions').innerText(), /5 below.*5 above/);
  assert.deepEqual(await summary(), originalStats);
  const yLabels = await workspace().locator('svg .axis-label[x="49"]').allTextContents();
  assert.equal(new Set(yLabels).size, yLabels.length);
  assert.ok(yLabels.every(value => Number.isInteger(Number(value.replaceAll(',', '')))));
  assert.deepEqual(await binSnapshot(), committed);
  pass('cropping accounts for 5 below/11 visible/5 above without dropping records from bins or changing statistics');

  const zoomed = await binSnapshot();
  for (const incomplete of ['-', '1e']) {
    await low().fill('');
    await low().pressSequentially(incomplete);
    assert.equal(await low().evaluate(input => input.validity.badInput), true);
    assert.equal(await button('Apply').isDisabled(), true);
    assert.match(await workspace().locator('.distribution-scale-error').innerText(), /number|numeric|incomplete|valid/i);
    await low().press('Enter');
    assert.deepEqual(await binSnapshot(), zoomed);
    await expectCount(11, 21);
    await button('Discard edits').click();
    assert.equal(await low().inputValue(), '5.703125');
    assert.equal(await low().evaluate(input => input.validity.badInput), false);
    assert.equal(await workspace().locator('.distribution-scale-error').count(), 0);
  }
  await low().fill('');
  await low().pressSequentially('-');
  await low().fill('');
  assert.equal(await low().evaluate(input => input.validity.badInput), false);
  await apply();
  await expectCount(16, 21);
  await low().fill('5.703125');
  await apply();
  await expectCount(11, 21);
  assert.deepEqual(await binSnapshot(), zoomed);
  pass('incomplete minus/exponent drafts cannot apply via Enter; discard restores the custom bound and intentional blank restores Auto');

  for (const input of [low(), high(), width()]) await input.fill('');
  await apply();
  await expectCount(21);
  assert.deepEqual(await binSnapshot(), original);
  assert.equal(await workspace().locator('.distribution-exclusions').count(), 0);
  pass('blank fields restore the data viewport, automatic tick labels and selected density');

  await width().fill('0.05');
  await apply();
  assert.equal(await bars().count(), 7);
  assert.match(await workspace().locator('.distribution-population em').innerText(), /manual width/);
  assert.equal(await workspace().locator('.jmp-normal-curve').count(), 1);
  const nonDivisible = await binSnapshot();
  assert.ok(nonDivisible.every(bin => Math.abs(bin.to - bin.from - .05) < 1e-12));
  assert.ok(nonDivisible.at(-1).to > Math.fround(values.at(-1)));
  await expectCount(21);
  await density().focus();
  await density().press('End');
  assert.equal(await width().inputValue(), '');
  assert.equal(await bars().count(), 100);
  assert.deepEqual(await summary(), originalStats);
  await width().fill('0.03125');
  await apply();
  assert.equal(await workspace().locator('.jmp-normal-curve').count(), 1);
  pass('manual width keeps equal full bins and the normal overlay; moving the slider replaces manual width immediately');

  await page.getByRole('combobox', { name: 'Filter by site', exact: true }).selectOption('1');
  await expectCount(11);
  await expectStats(values.filter((_, index) => index % 2 === 0));
  await page.getByRole('button', { name: 'Raw data', exact: true }).click();
  await page.getByRole('textbox', { name: 'Filter sequence column', exact: true }).fill('1..7');
  await openDistribution();
  await expectCount(4);
  await expectStats(values.filter((_, index) => index < 7 && index % 2 === 0));
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expectCount(21);
  assert.equal(await width().inputValue(), '0.03125');
  assert.deepEqual(await summary(), originalStats);
  pass('site and raw sequence filters update the histogram and independently checked statistics; clear preserves the applied scale');

  await page.getByRole('button', { name: 'Raw data', exact: true }).click();
  await page.getByRole('textbox', { name: 'Filter sequence column', exact: true }).fill('999..1000');
  await openDistribution();
  assert.match(await workspace().locator('.distribution-empty').innerText(), /No numeric data to plot/);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expectCount(21);
  pass('empty filtered populations show recovery guidance and restore correctly after clear');

  for (const plot of ['Site box plot', 'Sequence', 'CDF', 'Raw data']) {
    await page.getByRole('button', { name: plot, exact: true }).click();
    await openDistribution();
    assert.equal(await width().inputValue(), '0.03125');
  }
  await width().fill('0.0625'); // A draft must survive a tab switch without being applied.
  await page.getByRole('button', { name: 'Raw data', exact: true }).click();
  await openDistribution();
  assert.equal(await width().inputValue(), '0.0625');
  assert.equal(await bars().count(), 10);
  await page.getByRole('table', { name: 'Parametric test catalog', exact: true }).getByRole('button', { name: /^Select test 1002:/ }).click();
  await openAdvanced();
  assert.equal(await width().inputValue(), '');
  await button('Show specs').click();
  const tinyLabels = await workspace().locator('svg .axis-label[y="273"]').allTextContents();
  assert.ok(tinyLabels.length > 1);
  assert.equal(new Set(tinyLabels).size, tinyLabels.length);
  assert.ok(tinyLabels.every(label => Number.isFinite(Number(label)) && Number(label) > 0));
  assert.ok(tinyLabels.some(label => /e-/.test(label)));
  await width().fill('1e-10');
  await apply();
  assert.equal(await bars().count(), 4);
  await expectCount(21);
  await page.getByRole('table', { name: 'Parametric test catalog', exact: true }).getByRole('button', { name: /^Select test 1001:/ }).click();
  await openAdvanced();
  assert.equal(await width().inputValue(), '0.0625');
  assert.equal(await bars().count(), 10);
  await width().fill('0.03125');
  assert.equal(await button('Apply').isDisabled(), true);
  pass('applied settings and pending drafts persist across plot/test switches; tiny scientific labels stay distinct and exponent input works');

  for (const viewportWidth of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width: viewportWidth, height: 1000 });
    await workspace().scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    const dimensions = await workspace().evaluate(element => {
      const plot = element.querySelector('svg').getBoundingClientRect();
      const inputs = [...element.querySelectorAll('input')].map(input => {
        const bounds = input.getBoundingClientRect();
        return { type: input.type, left: bounds.left, right: bounds.right, width: bounds.width, height: bounds.height };
      });
      const numericLines = [...element.querySelectorAll('.jmp-summary dd')].map(value => {
        const range = document.createRange();
        range.selectNodeContents(value);
        return [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).length;
      });
      return { overflow: document.documentElement.scrollWidth > innerWidth + 1, plotWidth: plot.width, plotHeight: plot.height, inputs, numericLines };
    });
    assert.equal(dimensions.overflow, false, `horizontal overflow at ${viewportWidth}`);
    assert.ok(dimensions.plotWidth > 200 && dimensions.plotHeight > 100, `readable chart at ${viewportWidth}`);
    assert.ok(dimensions.inputs.every(input => input.width >= 80 && input.height >= (input.type === 'range' ? 24 : 30) && input.left >= 0 && input.right <= viewportWidth + 1));
    assert.ok(dimensions.numericLines.every(lines => lines === 1), `summary numbers must not wrap at ${viewportWidth}`);
    const screenshot = path.join(output, `distribution-${viewportWidth}.png`);
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: screenshot, fullPage: true });
    screenshots.push(screenshot);
  }
  pass('synthetic-only screenshots: 1440/1024/768/390 px, readable inputs and plots, no horizontal overflow');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await load('synthetic-extended-range.stdf', [5.5, ...values, 6.1]);
  assert.equal(await density().inputValue(), '50');
  assert.equal(await width().inputValue(), '');
  assert.equal(await low().inputValue(), '');
  assert.equal(await high().inputValue(), '');
  await expectCount(23);
  const extendedBins = await binSnapshot();
  await button('Show specs').click();
  await expectCount(23);
  assert.deepEqual(await binSnapshot(), extendedBins);
  await openAdvanced();
  await low().fill('5.6');
  await high().fill('6');
  await apply();
  await expectCount(21, 23);
  assert.match(await workspace().locator('.distribution-exclusions').innerText(), /1 below.*1 above/);
  assert.deepEqual(await binSnapshot(), extendedBins);
  await button('Fit data').click();
  assert.equal(await low().inputValue(), '');
  assert.equal(await high().inputValue(), '');
  await expectCount(23);
  assert.deepEqual(await binSnapshot(), extendedBins);
  await button('Reset').click();
  for (const input of [low(), high(), width()]) assert.equal(await input.inputValue(), '');
  await expectCount(23);
  pass('new runs reset settings; Show specs includes outliers, custom bounds crop only the viewport, and Fit data restores the view');

  await load('synthetic-narrow-data.stdf', [5.7, 5.75, 5.8, 5.85, 5.9]);
  const narrowBins = await binSnapshot(), narrowSummary = await summary();
  assert.equal(await bars().count(), 50);
  await button('Show specs').click();
  assert.equal(await low().getAttribute('placeholder'), 'Auto: 5.6');
  assert.equal(await high().getAttribute('placeholder'), 'Auto: 6');
  await expectCount(5);
  assert.deepEqual(await binSnapshot(), narrowBins);
  assert.deepEqual(await summary(), narrowSummary);
  await button('Fit data').click();
  assert.deepEqual(await binSnapshot(), narrowBins);
  assert.deepEqual(await summary(), narrowSummary);
  pass('narrow populations keep 50 data-based bins regardless of distant spec limits');

  await load('synthetic-nonfinite-failure.stdf', [5.7, NaN, 5.8]);
  await expectCount(2);
  assert.match(await workspace().locator('.distribution-exclusions').innerText(), /1 non-numeric records excluded/);
  const mixedSummary = await summary();
  assert.equal(mixedSummary['Numeric N'], '2');
  assert.ok(Math.abs(Number(mixedSummary.Mean) - (Math.fround(5.7) + Math.fround(5.8)) / 2) < 1e-6);
  assert.ok(Math.abs(Number(mixedSummary['Fail %']) - 100 / 3) < 1e-5);
  assert.match(await workspace().locator('.jmp-summary p').innerText(), /all 3 filtered records/);
  await page.getByRole('button', { name: 'Raw data', exact: true }).click();
  assert.equal((await page.locator('.raw-count b').innerText()).replaceAll(',', ''), '3 / 3');
  assert.equal(await page.locator('.raw-data tbody tr').count(), 3);
  assert.equal(await page.locator('.raw-data tbody .raw-result.fail').count(), 1);
  await openDistribution();
  pass('mixed nonfinite recorded failure remains in raw data and fail-rate denominator while numeric N/mean/bars exclude it');

  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  pass('no browser runtime errors or external HTTP requests');
} catch (error) {
  errors.push(error.stack || error.message);
  throw error;
} finally {
  fs.writeFileSync(path.join(output, 'distribution-ui-results.json'), JSON.stringify({
    url, fixtureSource: 'Generated in-memory synthetic STDF only', passed, errors, externalRequests, screenshots,
  }, null, 2));
  await browser.close();
}
