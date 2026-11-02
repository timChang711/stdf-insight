import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright-core';
import { syntheticStdf } from './synthetic-stdf.mjs';

const url=process.env.STDF_TEST_URL||'http://127.0.0.1:3000';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname));
const output=path.resolve('outputs/record-coverage');fs.mkdirSync(output,{recursive:true});
const envelope=(type,subtype,length)=>{const value=Buffer.alloc(4+length);value.writeUInt16LE(length);value[2]=type;value[3]=subtype;return value;};
// Minimal synthetic FTR/MPR records; extension payloads stay opaque.
const bytes=Buffer.concat([syntheticStdf(),envelope(15,20,7),envelope(15,20,7),envelope(15,15,8),envelope(1,90,0),envelope(0,30,0),envelope(180,99,3)]);
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1050}});
const errors=[],passed=[];page.on('pageerror',error=>errors.push(error.message));
const panel=()=>page.locator('.record-coverage-panel');
const row=type=>panel().locator(`[data-record-type="${type}"]`);
const pass=message=>{passed.push(message);console.log('PASS',message);};
const load=async(buffer,name='synthetic-coverage.stdf')=>{
  await page.locator('input[type=file]').first().setInputFiles({name,mimeType:'application/octet-stream',buffer});
  await page.getByRole('status').filter({hasText:'parsed locally'}).waitFor();
};
try{
  await page.goto(url);await page.getByRole('button', { name: 'Open STDF', exact: true }).first().waitFor();
  await load(bytes);
  assert.equal(await panel().getAttribute('open'),null);
  await panel().locator('summary').focus();await page.keyboard.press('Enter');
  assert.match(await panel().innerText(),/23 record envelopes/);
  assert.deepEqual((await row('15/20').locator('td').allTextContents()).slice(0,3),['15 / 20','2','Partial fields']);
  assert.match(await row('15/15').innerText(),/MPR.*1.*Partial fields/);
  assert.match(await panel().innerText(),/records, not test executions, results or dies/);
  pass('record counts are explicit; FTR/MPR dedicated decoding is distinguished from PTR analytics and execution counts');
  assert.match(await row('1/90').innerText(),/PSR/);assert.match(await row('0/30').innerText(),/VUR/);
  assert.match(await row('180/99').innerText(),/Unrecognized.*Not decoded/);
  assert.match(await row('15/10').innerText(),/Partial fields/);
  assert.match(await row('0/10').innerText(),/Initial header checked/);
  pass('known extension names, unknown types and partial support remain distinguishable');
  const ftrFields=await row('15/20').locator('td').allTextContents();
  const plainTable=await panel().locator('tbody').innerText();
  assert.equal(ftrFields[4],'18 / 19');
  assert.equal(ftrFields[5],`${syntheticStdf().length.toLocaleString('en-US')} / ${(syntheticStdf().length+11).toLocaleString('en-US')}`);
  await panel().locator('summary').click();await panel().locator('summary').click();
  await load(gzipSync(bytes),'synthetic-coverage.stdf.gz');
  assert.equal(await panel().getAttribute('open'),null);
  await panel().locator('summary').click();
  assert.equal(await panel().locator('tbody').innerText(),plainTable);
  pass('exact one-based record order and zero-based offsets survive collapse/reopen and gzip reload');
  for(const width of [1440,768,390]){
    await page.setViewportSize({width,height:1050});await page.waitForTimeout(350);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    const table=page.getByRole('region',{name:'STDF record coverage'});
    if(width===390)assert.ok(await table.evaluate(element=>element.scrollWidth>element.clientWidth));
    if(width===1440||width===390)await page.screenshot({path:path.join(output,`coverage-${width}.png`),fullPage:true});
  }
  pass('desktop/tablet/mobile keep table scrolling local without page overflow');
  await page.setViewportSize({width:1440,height:1050});await page.waitForTimeout(350);
  await page.getByRole('button',{name:'Sample run',exact:true}).click();
  assert.equal(await panel().count(),0);
  await load(syntheticStdf());
  assert.match(await panel().locator('summary').innerText(),/Record coverage and source details/);
  await panel().locator('summary').click();
  assert.equal(await row('15/20').count(),0);
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Run options'}).click();await page.getByRole('button',{name:'Clear workspace',exact:true}).click();
  assert.equal(await panel().count(),0);
  pass('sample/new run/clear removes stale coverage and preserves honest synthetic-demo state');
  assert.deepEqual(errors,[]);pass('no browser runtime errors');
}finally{
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({url,passed,errors},null,2));await browser.close();
}
