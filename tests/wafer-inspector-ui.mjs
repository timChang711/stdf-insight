import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { syntheticStdf } from './synthetic-stdf.mjs';

// Every STDF byte and screenshot in this suite is generated, never company data.
const url = process.env.STDF_TEST_URL || 'http://127.0.0.1:5175';
const isLocal = value => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);
assert.ok(isLocal(url), 'Wafer inspector UI tests require a loopback URL');
const output = path.resolve('outputs/round3/wafer-inspector');
fs.mkdirSync(output, { recursive: true });
const longName = 'SYNTHETIC_RECORDED_HIGH_LIMIT_FAILURE_' + 'FULL_TEST_NAME_MUST_REMAIN_READABLE_'.repeat(4);
const selectedName = 'SYNTHETIC_SELECTED_TEST_PASSES_WHILE_OVERALL_DIE_FAILS';

function inspectorFixture() {
  const chunks = [];
  const cn = value => Buffer.concat([Buffer.from([Buffer.byteLength(value)]), Buffer.from(value)]);
  const record = (type, sub, body) => {
    const header = Buffer.alloc(4);
    header.writeUInt16LE(body.length);
    header[2] = type; header[3] = sub;
    chunks.push(header, body);
  };
  const ptr = (id, name, site, value, fail = false) => {
    const required = Buffer.alloc(12);
    required.writeUInt32LE(id); required[4] = 1; required[5] = site;
    required[6] = fail ? 128 : 0;
    required.writeFloatLE(value, 8);
    const optional = Buffer.alloc(12);
    optional.writeFloatLE(0, 4); optional.writeFloatLE(4, 8);
    record(15, 10, Buffer.concat([required, cn(name), cn(''), optional, cn('V')]));
  };
  record(0, 10, Buffer.from([2, 4]));
  for (let index = 0; index < 7; index++) {
    const site = index === 4 ? 2 : index % 2 + 1;
    record(5, 10, Buffer.from([1, site]));
    if (index !== 2) ptr(1001, selectedName, site, index === 4 ? 2.5 : 2, index === 3);
    ptr(2002, longName, site, index === 0 || index === 3 ? 5 : 2);
    ptr(2003, 'SYNTHETIC_FLAGGED_FAILURE_THEN_PASS_RETAINED', site, 2, index === 0);
    if (index === 0) ptr(2003, 'SYNTHETIC_FLAGGED_FAILURE_THEN_PASS_RETAINED', site, 1);
    ptr(2004, 'SYNTHETIC_NONFINITE_RECORDED_FAILURE', site, index === 0 ? NaN : 2, index === 0);
    ptr(2005, 'SYNTHETIC_LOW_LIMIT_RECORDED_FAILURE', site, index === 0 ? -1 : 2);
    ptr(2006, 'SYNTHETIC_PASS_REFERENCE', site, 2);
    if (index === 1) {
      // Decoded PASS records: they do not explain or replace the recorded PRR FAIL.
      const functional = Buffer.alloc(20); functional.writeUInt32LE(3001); functional[4] = 1; functional[5] = site;
      record(15, 20, functional);
      const multiple = Buffer.alloc(12); multiple.writeUInt32LE(3002); multiple[4] = 1; multiple[5] = site;
      record(15, 15, multiple);
    }
    const failed = [0, 1, 3].includes(index), prr = Buffer.alloc(17);
    prr[0] = 1; prr[1] = site; prr[2] = failed ? 8 : 0;
    prr.writeUInt16LE(index === 2 ? 5 : index === 0 ? 7 : 6, 3);
    prr.writeUInt16LE(failed ? 5 : 1, 5); prr.writeUInt16LE(failed ? 7 : 1, 7);
    prr.writeInt16LE(index === 4 ? 0 : index > 4 ? index - 1 : index, 9);
    prr.writeInt16LE(0, 11); prr.writeUInt32LE(120 + index, 13);
    record(5, 20, prr);
  }
  return Buffer.concat(chunks);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
page.setDefaultTimeout(15000);
const errors = [], externalRequests = [], passed = [], screenshots = [], coverageChecks = [];
await page.addInitScript(() => {
  window.__coverageTransitions = [];
  const recordCount = () => {
    const count = document.querySelectorAll('.record-coverage-panel').length;
    if (window.__coverageTransitions.at(-1)?.count !== count) {
      window.__coverageTransitions.push({ count, at: performance.now(), fileName: document.querySelector('.active-file small')?.textContent ?? null });
    }
  };
  new MutationObserver(recordCount).observe(document, { childList: true, subtree: true });
  recordCount();
});
page.on('pageerror', error => errors.push(error.message));
await page.route('**/*', async route => {
  const address = route.request().url();
  if (/^https?:/.test(address) && !isLocal(address)) {
    externalRequests.push(address); await route.abort();
  } else await route.continue();
});
const assertCoverage = async (label, expected = 1) => {
  const count = await page.locator('.record-coverage-panel').count();
  const transitions = await page.evaluate(() => window.__coverageTransitions ?? []);
  coverageChecks.push({ label, count, expected });
  assert.equal(count, expected, `${label}: expected ${expected} record coverage panel(s), found ${count}`);
  assert.equal(transitions.some(transition => transition.count > 1), false, `${label}: duplicate coverage panel appeared during a DOM update: ${JSON.stringify(transitions)}`);
};
const pass = async label => { await assertCoverage(label); passed.push(label); console.log('PASS', label); };
const map = () => page.locator('.wafer-page .wafer-grid-map');
const die = (x, y = 0) => map().locator(`.wafer-die[data-x="${x}"][data-y="${y}"]`);
const viewport = () => page.locator('.wafer-page').getByRole('region', { name: 'Scrollable wafer coordinate grid' });
const inspector = () => page.getByRole('region', { name: 'Selected die records', exact: true });
const part = index => inspector().getByRole('article', { name: `Part ${index} inspection`, exact: true });
const overall = index => part(index).locator('.die-part-summary');
const resultRows = index => part(index).locator('.die-results-table tbody > tr[data-kind]');
const testRows = (index, testNumber) => part(index).locator(`.die-results-table tbody > tr[data-test-number="${testNumber}"]`);
const selected = index => part(index).locator('.die-results-table tbody > tr.die-test-current');
const failures = index => part(index).locator('.die-results-table tbody > tr[data-verdict="FAIL"]');
const size = () => page.getByRole('spinbutton', { name: 'Wafer cell size', exact: true });
const slider = () => page.getByRole('slider', { name: 'Wafer cell size slider', exact: true });
const control = name => page.getByRole('group', { name: 'Wafer map size', exact: true }).getByRole('button', { name, exact: true });
const cellWidth = async () => Number(await die(0).locator('.wafer-die-fill').getAttribute('width'));
const load = async (name, buffer = inspectorFixture()) => {
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'application/octet-stream', buffer });
  await page.waitForFunction(fileName => document.querySelector('.active-file small')?.textContent === fileName, name);
  await assertCoverage(`loaded ${name}`);
  const nav = page.getByRole('button', { name: 'Open navigation' });
  if (await nav.isVisible()) await nav.click();
  await page.locator('.sidebar nav').getByRole('button', { name: 'Wafer map' }).click();
  await map().waitFor();
  await assertCoverage(`opened wafer map for ${name}`);
};
const setSize = async (value, enter = false) => {
  await size().fill(String(value));
  if (enter) await size().press('Enter');
  else await control('Apply size').click();
  await page.waitForFunction(expected => {
    const rect = document.querySelector('.wafer-page .wafer-die[data-x="0"][data-y="0"] .wafer-die-fill');
    return Number(rect?.getAttribute('width')) === expected;
  }, value);
  await assertCoverage(`applied cell size ${value}`);
};
const clickCenter = async locator => {
  const fill = locator.locator('.wafer-die-fill');
  await fill.scrollIntoViewIfNeeded();
  const bounds = await fill.boundingBox();
  assert.ok(bounds && bounds.width > 0 && bounds.height > 0);
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y)?.closest('.wafer-die');
    return element && `${element.getAttribute('data-x')},${element.getAttribute('data-y')}`;
  }, point);
  assert.equal(hit, `${await locator.getAttribute('data-x')},${await locator.getAttribute('data-y')}`);
  await page.mouse.click(point.x, point.y);
  assert.equal(await locator.getAttribute('aria-pressed'), 'true');
  await assertCoverage(`selected die ${await locator.getAttribute('data-x')},${await locator.getAttribute('data-y')}`);
};

try {
  await page.goto(url); await page.waitForLoadState('networkidle');
  await load('synthetic-inspector.stdf');
  assert.equal(await cellWidth(), 32);
  assert.equal(await slider().getAttribute('min'), '4');
  assert.equal(await slider().getAttribute('max'), '80');
  assert.equal(await slider().getAttribute('step'), '0.1');
  assert.equal(await map().locator('.wafer-die').count(), 6);
  assert.equal(await die(0).getAttribute('data-record-count'), '2');
  assert.equal(await die(0).getAttribute('data-disposition'), 'PASS');
  await clickCenter(die(0));
  await part(1).waitFor(); await part(5).waitFor();
  assert.equal(await inspector().getByRole('article').count(), 2);
  await pass('generated same-coordinate records remain distinct; last record supplies map color and actual center hit selects both records');

  assert.equal(await overall(1).locator('.wafer-result-badge').innerText(), 'FAIL');
  assert.equal(await selected(1).locator('.wafer-result-badge').innerText(), 'PASS');
  assert.equal(await selected(1).locator('.die-test-value').innerText(), '2');
  assert.equal(await selected(1).locator('td').nth(3).innerText(), 'V');
  assert.deepEqual(await overall(1).locator(':scope > span > b').allTextContents(), ['5', '7']);
  assert.equal(await overall(5).locator('.wafer-result-badge').innerText(), 'PASS');
  assert.equal(await selected(5).locator('.die-test-value').innerText(), '2.5');
  assert.equal(await part(1).locator('.wafer-shown-record').count(), 0);
  assert.equal(await part(5).locator('.wafer-shown-record').innerText(), 'Shown on map');
  assert.deepEqual(await inspector().getByRole('article').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label'))), ['Part 1 inspection', 'Part 5 inspection']);
  await pass('compact PRR summary and selected-test PASS remain separate; duplicate coordinates preserve their own values, bins and dispositions');

  assert.equal(await resultRows(1).count(), 7);
  assert.equal(await resultRows(5).count(), 6);
  assert.deepEqual(await failures(1).locator('.die-test-number').allTextContents(), ['2002', '2003', '2004', '2005']);
  assert.equal(await testRows(1, 2002).locator('.die-test-name').textContent(), longName);
  assert.deepEqual(await testRows(1, 2003).locator('.wafer-result-badge').allTextContents(), ['FAIL', 'PASS']);
  assert.deepEqual(await testRows(1, 2003).locator('.die-test-value').allTextContents(), ['2', '1']);
  assert.match(await testRows(1, 2004).locator('.die-test-value').innerText(), /NaN.*Invalid numeric value/s);
  assert.equal(await testRows(1, 2004).getAttribute('data-verdict'), 'FAIL');
  assert.equal(await testRows(1, 2005).locator('.die-test-value').innerText(), '-1');
  assert.equal(await failures(5).count(), 0);
  assert.match(await part(1).locator('.die-test-counts').innerText(), /3 PASS.*4 FAIL/s);
  await part(1).locator('.die-context-details > summary').click();
  assert.match(await part(1).locator('.die-context-details').innerText(), /separate from the PRR.*Repeated observations remain separate/s);
  await testRows(1, 2003).first().getByRole('button', { name: /^Show details/ }).click();
  assert.match(await part(1).locator('.die-result-expanded').innerText(), /Parsed result.*FAIL/s);
  await testRows(1, 2003).first().getByRole('button', { name: /^Hide details/ }).click();
  await pass('all test rows include passes and failures; full names, both repeated outcomes, source details and invalid numeric failures remain available');

  await clickCenter(die(1));
  assert.equal(await overall(2).locator('.wafer-result-badge').innerText(), 'FAIL');
  assert.equal(await selected(2).locator('.wafer-result-badge').innerText(), 'PASS');
  assert.equal(await failures(2).count(), 0);
  assert.equal(await resultRows(2).count(), 8);
  assert.equal(await part(2).locator('.wafer-coverage-note').count(), 0);
  assert.deepEqual(await testRows(2, 3001).getAttribute('data-kind'), 'FTR');
  assert.deepEqual(await testRows(2, 3002).getAttribute('data-kind'), 'MPR');
  assert.equal(await testRows(2, 3001).getAttribute('data-verdict'), 'PASS');
  assert.equal(await testRows(2, 3002).getAttribute('data-verdict'), 'PASS');
  await clickCenter(die(2));
  assert.equal(await overall(3).locator('.wafer-result-badge').innerText(), 'PASS');
  assert.equal(await selected(3).count(), 0);
  assert.equal(await testRows(3, 1001).count(), 0);
  assert.equal(await resultRows(3).count(), 5);
  await pass('PTR-scoped failure absence and decoded FTR/MPR PASS evidence preserve PRR FAIL; absent selected measurements never become PASS');

  await clickCenter(die(0));
  const testPicker = page.getByRole('combobox', { name: 'Select wafer map test', exact: true });
  await testPicker.selectOption('2002');
  await assertCoverage('selected PTR test 2002');
  assert.equal(await selected(1).locator('.wafer-result-badge').innerText(), 'FAIL');
  assert.equal(await selected(1).locator('.die-test-value').innerText(), '5');
  assert.equal(await selected(5).locator('.wafer-result-badge').innerText(), 'PASS');
  await testPicker.selectOption('2003');
  await assertCoverage('selected PTR test 2003');
  assert.deepEqual(await selected(1).locator('.wafer-result-badge').allTextContents(), ['FAIL', 'PASS']);
  assert.deepEqual(await selected(1).locator('.die-test-value').allTextContents(), ['2', '1']);
  await testPicker.selectOption('2004');
  await assertCoverage('selected PTR test 2004');
  assert.equal(await selected(1).locator('.wafer-result-badge').innerText(), 'FAIL');
  assert.match(await selected(1).locator('.die-test-value').innerText(), /NaN.*Invalid numeric value/s);
  assert.equal(await overall(1).locator('.wafer-result-badge').innerText(), 'FAIL');
  await testPicker.selectOption('1001');
  await assertCoverage('selected PTR test 1001');
  await pass('changing selected test updates each record independently, exposes repeated results and preserves invalid numeric recorded failures');

  await size().fill('44.5');
  assert.equal(await cellWidth(), 32, 'numeric typing must not resize before Apply');
  await control('Apply size').click();
  assert.equal(await cellWidth(), 44.5);
  assert.equal(await die(0).getAttribute('aria-pressed'), 'true');
  await size().fill('51.2');
  await size().press('Escape');
  assert.equal(await size().inputValue(), '44.5');
  assert.equal(await cellWidth(), 44.5);
  await size().fill('60'); await control('Discard').click();
  assert.equal(await size().inputValue(), '44.5');
  await setSize(45.1, true);
  await pass('fractional cell size is staged until Apply/Enter; Escape and Discard preserve the map and selection');

  for (const invalid of ['', '0', '3.9', '80.1', '-1']) {
    await size().fill(invalid);
    assert.equal(await control('Apply size').isDisabled(), true);
    await size().press('Enter');
    assert.equal(await cellWidth(), 45.1);
    assert.match(await page.locator('.wafer-zoom-error').innerText(), /4.*80/);
    await control('Discard').click();
    assert.equal(await size().inputValue(), '45.1');
  }
  for (const incomplete of ['-', '1e']) {
    await size().fill(''); await size().pressSequentially(incomplete);
    assert.equal(await size().evaluate(input => input.validity.badInput), true);
    assert.equal(await control('Apply size').isDisabled(), true);
    await size().press('Enter'); assert.equal(await cellWidth(), 45.1);
    await control('Discard').click();
    assert.equal(await size().evaluate(input => input.validity.badInput), false);
    assert.equal(await size().inputValue(), '45.1');
  }
  await pass('empty/out-of-range/unfinished numeric inputs cannot resize; Discard clears the native invalid buffer');

  for (let iteration = 0; iteration < 4; iteration++) {
    await slider().focus(); await slider().press('Home');
    assert.equal(await cellWidth(), 4);
    await clickCenter(die(0)); await clickCenter(die(5));
    const minimumFocus = die(5).locator('.wafer-die-focus');
    assert.ok(Number(await minimumFocus.getAttribute('width')) > 0);
    assert.ok(Number(await minimumFocus.getAttribute('height')) > 0);
    assert.equal(await minimumFocus.evaluate(element => getComputedStyle(element).stroke), 'rgb(22, 62, 198)');
    await slider().focus(); await slider().press('End');
    assert.equal(await cellWidth(), 80);
    await clickCenter(die(5)); await clickCenter(die(0));
    assert.equal(await map().locator('.wafer-die').count(), 6);
  }
  await slider().press('Home'); await slider().press('ArrowRight');
  assert.equal(await cellWidth(), 4.1);
  await control('Reset size').click();
  assert.equal(await cellWidth(), 32);
  assert.equal(await die(0).getAttribute('aria-pressed'), 'true');
  await pass('slider supports 4/80 px limits and .1 steps; repeated zoom retains records and exact die hit targets');

  await setSize(47.3);
  await page.getByRole('combobox', { name: 'Select wafer map test', exact: true }).selectOption('2002');
  await assertCoverage('selected PTR test 2002');
  assert.equal(await cellWidth(), 47.3);
  assert.equal(await die(0).getAttribute('aria-pressed'), 'true');
  await page.getByRole('combobox', { name: 'Select wafer map test', exact: true }).selectOption('1001');
  await assertCoverage('selected PTR test 1001');
  assert.equal(await cellWidth(), 47.3);
  await pass('switching selected tests preserves applied size and selected die');

  await control('Fit to view').click();
  await page.waitForFunction(() => document.querySelector('.wafer-zoom-presets button')?.getAttribute('aria-pressed') === 'true');
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.waitForTimeout(350); // ResizeObserver + responsive navigation transition.
    assert.equal(await control('Fit to view').getAttribute('aria-pressed'), 'true');
    const geometry = await viewport().evaluate(element => ({
      client: element.clientWidth, scroll: element.scrollWidth,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    }));
    assert.equal(geometry.pageOverflow, false, `page overflow at ${width}`);
    assert.ok(geometry.scroll <= geometry.client + 1, `six-column fixture should fit at ${width}`);
    assert.ok(await cellWidth() >= 4 && await cellWidth() <= 80);
    await clickCenter(die(0));
    assert.equal(await inspector().getByRole('article').count(), 2);
    if ([1440, 390].includes(width)) {
      assert.equal(await failures(1).count(), 4);
      assert.equal(await testRows(1, 2002).locator('.die-test-name').textContent(), longName);
      assert.equal(await part(1).evaluate(element => element.scrollWidth > element.clientWidth + 1), false, `inspector overflow at ${width}`);
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
      const screenshot = path.join(output, `wafer-inspector-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true }); screenshots.push(screenshot);
    }
  }
  await size().fill('24.2'); await size().press('Enter');
  assert.equal(await control('Fit to view').getAttribute('aria-pressed'), 'false');
  await pass('Fit to view tracks desktop/mobile size changes without page overflow; manual size exits Fit mode');

  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  assert.equal(await inspector().getByRole('article').count(), 0);
  await clickCenter(die(0));
  await page.setViewportSize({ width: 1440, height: 1100 });
  const beforeCancel = await inspector().innerText();
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'synthetic-cancel-wafer.stdf', mimeType: 'application/octet-stream', buffer: syntheticStdf({ parts: 100000 }),
  });
  await page.getByRole('button', { name: 'Cancel loading', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Loading cancelled' }).waitFor();
  assert.equal(await inspector().innerText(), beforeCancel);
  assert.equal(await cellWidth(), 24.2);
  assert.equal(await page.locator('.active-file small').innerText(), 'synthetic-inspector.stdf');
  await pass('clear selection/reselect work repeatedly; cancelling another file preserves active inspector and zoom');

  await load('synthetic-inspector-next.stdf');
  assert.equal(await cellWidth(), 32);
  assert.equal(await size().inputValue(), '32');
  assert.equal(await inspector().getByRole('article').count(), 0);
  await clickCenter(die(1));
  await page.getByRole('button', { name: 'Run options' }).click();
  await page.getByRole('button', { name: 'Clear workspace', exact: true }).click();
  assert.equal(await page.locator('.empty-active-file').count(), 1);
  await assertCoverage('cleared workspace', 0);
  await load('synthetic-inspector-reopened.stdf');
  assert.equal(await cellWidth(), 32);
  assert.equal(await inspector().getByRole('article').count(), 0);
  await pass('new run and clear/reopen reset zoom to 32 px and remove stale die inspection');

  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  await pass('no browser runtime errors or external HTTP requests');
} catch (error) {
  errors.push(error.stack || error.message);
  const screenshot = path.join(output, 'wafer-inspector-failure.png');
  await page.screenshot({ path: screenshot, fullPage: true }); screenshots.push(screenshot);
  throw error;
} finally {
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({
    url, fixtureSource: 'Generated in-memory synthetic STDF only', passed, errors, externalRequests, screenshots,
    coverageChecks, coverageTransitions: await page.evaluate(() => window.__coverageTransitions ?? []),
  }, null, 2));
  await browser.close();
}
