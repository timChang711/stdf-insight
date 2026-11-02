import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { syntheticStdf } from './synthetic-stdf.mjs';

// Entirely generated fixtures. Never run company STDF or capture its identifiers here.
const url = process.env.STDF_TEST_URL || 'http://127.0.0.1:3000';
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname));
const output = path.resolve('outputs/round2/wafer');
fs.mkdirSync(output, { recursive: true });
const fixture = (parts, edit = () => {}, geometry = false) => {
  const bytes = syntheticStdf({ parts }); let index = 0;
  for (let offset = 0; offset < bytes.length;) {
    const length = bytes.readUInt16LE(offset);
    if (bytes[offset + 2] === 5 && bytes[offset + 3] === 20) edit(bytes.subarray(offset + 4, offset + 4 + length), index++);
    offset += length + 4;
  }
  if (!geometry) return bytes;
  const wcr = Buffer.alloc(17); wcr.writeUInt16LE(13); wcr[2] = 2; wcr[3] = 30;
  wcr.writeFloatLE(200, 4); wcr.writeFloatLE(1, 8); wcr.writeFloatLE(2, 12); wcr[16] = 4;
  return Buffer.concat([bytes.subarray(0, 6), wcr, bytes.subarray(6)]);
};
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [], passed = [];
page.on('pageerror', error => errors.push(error.message));
const pass = label => { passed.push(label); console.log('PASS', label); };
const input = () => page.locator('input[type=file]').first();
const load = async (buffer) => {
  await input().setInputFiles({ name: 'synthetic-wafer.stdf', mimeType: 'application/octet-stream', buffer });
  await page.getByRole('status').filter({ hasText: 'parsed locally' }).waitFor();
  if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.locator('.sidebar nav').getByRole('button', { name: 'Wafer map' }).click();
  await page.locator('.wafer-page').waitFor();
};
const map = () => page.locator('.wafer-page .wafer-grid-map');
const die = (x, y) => map().locator(`.wafer-die[data-x="${x}"][data-y="${y}"]`);
const fullMap = () => page.getByRole('region', { name: 'Scrollable wafer coordinate grid' });
try {
  await page.goto(url); await page.getByRole('button', { name: 'Open STDF', exact: true }).first().waitFor();
  await load(fixture(128));
  assert.match(await map().getAttribute('aria-label'), /Pass \/ fail/);
  assert.equal(await page.locator('.wafer-page .map-mode button.active').evaluate(element => getComputedStyle(element).color), 'rgb(255, 255, 255)');
  assert.equal(await die(0, 0).locator('.wafer-die-fill').getAttribute('fill'), '#00ee00');
  assert.equal(await die(3, 0).locator('.wafer-die-fill').getAttribute('fill'), '#ff0000');
  assert.equal(await die(0, 0).locator('text').textContent(), 'P');
  assert.equal(await die(3, 0).locator('text').textContent(), 'F');
  assert.equal(await die(3, 0).locator('text').getAttribute('fill'), '#fff');
  assert.ok(Number(await die(0, 1).locator('.wafer-die-fill').getAttribute('y')) > Number(await die(0, 0).locator('.wafer-die-fill').getAttribute('y')));
  assert.equal(await map().locator('.wafer-die').count(), 128);
  assert.equal(await map().locator('circle').count(), 0);
  pass('reference style: rectangular grid, bright P/F cells, X/Y labels, Y increases down');

  await die(3, 0).click();
  assert.match(await page.getByRole('region', { name: 'Selected die records' }).innerText(), /Die X 3 · Y 0/);
  const inspectedPart = map().getByRole('article', { name: 'Part 4 inspection', exact: true });
  assert.match(await inspectedPart.locator('header').innerText(), /Part 4.*Site 2/s);
  assert.equal(await inspectedPart.locator('.die-part-summary .wafer-result-badge').innerText(), 'FAIL');
  assert.deepEqual(await inspectedPart.locator('.die-part-summary > span > b').allTextContents(), ['5', '5']);
  assert.equal(await inspectedPart.locator('.die-test-current .die-test-value').innerText(), '4');
  assert.equal(await inspectedPart.locator('.die-test-current td').nth(3).innerText(), 'V');
  assert.equal(await inspectedPart.locator('.die-test-current .wafer-result-badge').innerText(), 'PASS');
  assert.equal(await inspectedPart.locator('.die-results-table tbody > tr[data-kind]').count(), 2);
  await die(3, 0).focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await die(4, 0).getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('ArrowDown'); assert.equal(await die(4, 1).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  assert.equal(await map().locator('.wafer-part-inspection').count(), 0);
  await page.getByRole('combobox', { name: 'Wafer Y direction' }).selectOption('up');
  assert.ok(Number(await die(0, 1).locator('.wafer-die-fill').getAttribute('y')) < Number(await die(0, 0).locator('.wafer-die-fill').getAttribute('y')));
  await page.getByRole('combobox', { name: 'Wafer Y direction' }).selectOption('down');
  await page.getByRole('spinbutton', { name: 'Wafer cell size', exact: true }).fill('44');
  await page.getByRole('button', { name: 'Apply size', exact: true }).click();
  assert.equal(Number(await die(0, 0).locator('.wafer-die-fill').getAttribute('width')), 44);
  await page.getByRole('button', { name: 'Reset size', exact: true }).click();
  pass('click/keyboard inspector, exact raw fields, clear, orientation and zoom');

  await page.getByRole('button', { name: 'Bin map', exact: true }).click();
  assert.equal(await die(3, 0).locator('text').textContent(), '5');
  assert.match(await map().locator('.wafer-grid-legend').innerText(), /HB 5/);
  await page.getByRole('button', { name: 'Parametric', exact: true }).click();
  assert.match(await map().locator('.wafer-grid-legend').innerText(), /Outside color range/);
  await page.getByRole('button', { name: 'Pass / fail', exact: true }).click();
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.waitForTimeout(350); // Let the responsive sidebar transition finish before visual checks.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Page overflow at ${width}`);
    assert.ok((await fullMap().boundingBox()).width > 200);
    if (width === 390) assert.ok(await fullMap().evaluate(element => element.scrollWidth > element.clientWidth), 'grid must scroll locally');
    if ([1440, 390].includes(width)) await page.screenshot({ path: path.join(output, `wafer-${width}.png`), fullPage: true });
  }
  pass('bin/parametric modes remain available; 1440/1024/768/390 layouts and local scroll');

  await page.setViewportSize({ width: 1440, height: 1100 });
  await load(fixture(401, (prr, index) => { if (index === 400) { prr[2] = 8; prr.writeUInt16LE(9, 5); } }));
  assert.equal(await die(0, 0).getAttribute('data-record-count'), '2');
  assert.equal(await die(0, 0).getAttribute('data-disposition'), 'FAIL');
  assert.match(await map().locator('.wafer-grid-warning').innerText(), /No retest consolidation/);
  await die(0, 0).click();
  assert.equal(await map().locator('.wafer-part-inspection').count(), 2);
  const lastPart = map().getByRole('article', { name: 'Part 401 inspection', exact: true });
  assert.equal(await lastPart.locator('.wafer-shown-record').innerText(), 'Shown on map');
  assert.equal(await lastPart.locator('.die-part-summary > span > b').first().innerText(), '9');
  pass('duplicate coordinates retain every record and explicitly mark last-record display');

  await load(fixture(1, prr => { prr.writeInt16LE(1200, 9); prr.writeInt16LE(-1500, 11); }, true));
  assert.equal(await die(1200, -1500).count(), 1);
  const ratio = Number(await die(1200, -1500).locator('.wafer-die-fill').getAttribute('width')) / Number(await die(1200, -1500).locator('.wafer-die-fill').getAttribute('height'));
  assert.equal(ratio, 2);
  assert.equal(await map().locator('.wafer-part-inspection').count(), 0, 'new file clears selection');
  pass('valid coordinates beyond ±1000 and recorded WCR aspect ratio retained');

  await load(fixture(2, (prr, index) => { prr.writeInt16LE(index ? 32000 : -32000, 9); }));
  assert.equal(await map().locator('.wafer-grid-window').count(), 1);
  assert.equal(await die(-32000, 0).count(), 1);
  await page.getByRole('spinbutton', { name: 'First visible wafer X' }).fill('31841');
  assert.equal(await die(32000, 0).count(), 1);
  assert.ok(await map().locator('svg *').count() < 250, 'large blank extents should not allocate empty cell nodes');
  pass('pathological coordinate extent uses bounded movable grid window');

  await load(fixture(2, (prr, index) => { if (index === 0) prr.writeInt16LE(-32768, 9); }));
  assert.equal(await map().locator('.wafer-die').count(), 1);
  assert.match(await map().locator('.wafer-grid-counts').innerText(), /1 records without coordinates/);
  await load(fixture(1, prr => { prr.writeInt16LE(-32768, 9); }));
  assert.match(await page.locator('.wafer-page .no-data').innerText(), /No valid wafer coordinates/);
  pass('missing-coordinate sentinel excluded and empty map recovers without error');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ url, passed, pageErrors: errors }, null, 2));
} finally { await browser.close(); }
