import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { syntheticStdf } from './synthetic-stdf.mjs';
import { gzipSync } from 'node:zlib';

// Runs only against a local server. Generated fixtures never leave this machine.
const url=process.env.STDF_TEST_URL||'http://127.0.0.1:5173';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname),'UI tests require a loopback URL');
const output=path.resolve('outputs/round1',new URL(url).port==='5173'?'development':'built-preview');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],passed=[];
page.on('pageerror',error=>errors.push(error.message));
const pass=label=>{passed.push(label);console.log('PASS',label)};
const input=()=>page.locator('input[type=file]').first();
const load=async(name,buffer)=>{await input().setInputFiles({name,mimeType:'application/octet-stream',buffer});await page.getByRole('status').filter({hasText:'parsed locally'}).waitFor()};
const count=async expected=>assert.equal((await page.locator('.raw-count b').innerText()).replaceAll(',',''),expected);
const openTests=async()=>{await page.getByRole('button',{name:'Test explorer'}).click();await page.locator('.distribution-workspace').waitFor()};
const catalog=()=>page.getByRole('table',{name:'Parametric test catalog',exact:true});
const testButton=id=>catalog().getByRole('button',{name:new RegExp(`^Select test ${id}:`)});
try{
  await page.goto(url);await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('button',{name:'Test explorer'}).isDisabled(),true);
  await load('synthetic.stdf',syntheticStdf({parts:128}));
  await openTests();assert.equal(await catalog().locator('tbody tr.catalog-row').count(),2);pass('load synthetic STDF and open Test Explorer');
  assert.deepEqual(await catalog().locator('thead th').allTextContents(),['Test #','Test name','Fail %','Cpk']);
  await testButton(1001).click();await testButton(1001).press('ArrowDown');
  assert.equal(await testButton(1002).getAttribute('aria-pressed'),'true');
  assert.equal(await testButton(1002).evaluate(element=>element===document.activeElement),true);
  assert.match(await page.locator('.analysis-head .test-id').innerText(),/TEST 1002/);
  await testButton(1002).press('ArrowDown');assert.equal(await testButton(1002).getAttribute('aria-pressed'),'true');
  await testButton(1002).press('Home');assert.equal(await testButton(1001).getAttribute('aria-pressed'),'true');
  await testButton(1001).press('End');assert.equal(await testButton(1002).getAttribute('aria-pressed'),'true');
  await testButton(1002).press('ArrowUp');assert.equal(await testButton(1001).getAttribute('aria-pressed'),'true');
  await testButton(1001).press('ArrowUp');assert.equal(await testButton(1001).getAttribute('aria-pressed'),'true');
  assert.equal(await catalog().locator('button[tabindex="0"]').count(),1);
  const testSearch=page.getByRole('textbox',{name:'Search tests',exact:true});
  await testSearch.fill('CURRENT');await testSearch.press('ArrowDown');
  assert.equal(await testSearch.inputValue(),'CURRENT');
  assert.match(await page.locator('.analysis-head .test-id').innerText(),/TEST 1001/);
  await testButton(1002).click();await testButton(1002).press('ArrowUp');
  assert.equal(await testButton(1002).getAttribute('aria-pressed'),'true');
  await testSearch.fill('');await testButton(1001).click();
  pass('native catalog columns, roving focus, arrow/Home/End boundaries and filtered keyboard switching work without hijacking search');
  await page.getByRole('button',{name:'Raw data',exact:true}).click();await count('128 / 128');
  await page.getByRole('textbox',{name:'Filter sequence column'}).fill('1..10');await count('10 / 128');
  await page.getByRole('combobox',{name:'Filter site column'}).selectOption('2');await count('5 / 128');
  await page.getByRole('button',{name:'Distribution',exact:true}).click();
  assert.equal(await page.locator('.jmp-summary dl>div').first().locator('dd').innerText(),'5');
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  assert.equal(await page.locator('.jmp-summary dl>div').first().locator('dd').innerText(),'128');pass('column filters update charts/statistics; clear restores population');
  await page.getByRole('combobox',{name:'Filter by site',exact:true}).selectOption('1');
  assert.equal(await page.locator('.jmp-summary dl>div').first().locator('dd').innerText(),'64');
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();pass('site filtering and reset');
  await page.getByText('Advanced settings',{exact:true}).click();
  await page.getByRole('spinbutton',{name:'Histogram bin width',exact:true}).fill('0');
  assert.match(await page.locator('.distribution-scale-error').innerText(),/Bin width/);
  await page.getByRole('button',{name:'Reset',exact:true}).click();assert.equal(await page.locator('.distribution-scale-error').count(),0);pass('invalid bin width blocked and scale reset');
  await page.getByRole('textbox',{name:'Search tests',exact:true}).fill('no_such_test');
  await page.getByRole('button',{name:'Clear test filters',exact:true}).click();assert.equal(await catalog().locator('tbody tr.catalog-row').count(),2);pass('empty search recovery');
  for(const plot of ['Site box plot','Sequence','CDF','Raw data','Distribution'])await page.getByRole('button',{name:plot,exact:true}).click();
  for(const width of [1440,1024,768,390]){
    await page.setViewportSize({width,height:1000});
    const bounds=await page.locator('.distribution-workspace').boundingBox();assert.ok(bounds&&bounds.width>200&&bounds.height>250);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);assert.equal(overflow,false,`horizontal overflow at ${width}`);
    const summary=await page.locator('.jmp-summary').boundingBox(),plot=await page.locator('.jmp-distribution-body>svg').boundingBox();assert.ok(summary&&plot&&plot.height>100);
    await page.screenshot({path:path.join(output,`explorer-${width}.png`),fullPage:true});
  }pass('charts and long test names fit 1440/1024/768/390 px');
  await page.setViewportSize({width:1440,height:1000});
  await load('synthetic.stdf',syntheticStdf({parts:128}));await openTests();
  assert.equal(await page.locator('.analysis-filter-state').count(),0);assert.equal(await page.getByRole('button',{name:'Distribution',exact:true}).getAttribute('aria-pressed'),'true');pass('reload same filename resets prior analysis state');
  await load('second.stdf.gz',gzipSync(syntheticStdf({parts:128})));await page.getByRole('button',{name:'Compare runs'}).click();
  const rank=page.locator('.correlation-rank button');await rank.nth(1).click();
  assert.equal(await rank.nth(1).getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('.correlation-panel h2').innerText(),/SYNTHETIC_/);assert.equal(await page.locator('.correlation-scatter').count(),1);pass('gzip loads locally and ranking updates the paired scatter');
  await input().setInputFiles({name:'broken.stdf',mimeType:'application/octet-stream',buffer:Buffer.from([2,0,0,10,2,3])});
  await page.getByRole('alert').filter({hasText:'Unsupported STDF version'}).waitFor();assert.equal(await page.locator('.correlation-scatter').count(),1);pass('invalid file reports error and preserves current run');
  const big=syntheticStdf({parts:100000});
  await input().setInputFiles({name:'cancel.stdf',mimeType:'application/octet-stream',buffer:big});
  await page.getByRole('button',{name:'Cancel loading',exact:true}).click();await page.getByRole('status').filter({hasText:'Loading cancelled'}).waitFor();
  await page.waitForTimeout(400);assert.equal(await page.locator('.active-file small').innerText(),'second.stdf.gz');pass('cancellation preserves active run after asynchronous parsing');
  await input().setInputFiles({name:'stale.stdf',mimeType:'application/octet-stream',buffer:big});
  await page.getByRole('button',{name:'Run options'}).click();await page.getByRole('button',{name:'Clear workspace',exact:true}).click();
  await page.waitForTimeout(400);assert.equal(await page.locator('.empty-active-file').count(),1);pass('clear during parse prevents a stale run from returning');
  // Simulated picker/traversal delays exercise cancellation without requesting OS access.
  await page.evaluate(()=>{
    window.showDirectoryPicker=async()=>({
      kind:'directory',
      async *values(){
        await new Promise(resolve=>setTimeout(resolve,600));
        yield {kind:'file',name:'late.stdf',getFile:async()=>new File([new Uint8Array([2,0,0,10,2,4])],'late.stdf')};
      },
    });
  });
  await page.getByRole('button',{name:'Open folder',exact:true}).first().click();await page.getByRole('button',{name:'Cancel loading',exact:true}).click();
  await page.waitForTimeout(750);assert.equal(await page.locator('.empty-active-file').count(),1);assert.equal(await page.getByRole('alert').count(),0);pass('cancel folder discovery prevents a delayed folder from replacing the workspace');
  await page.evaluate(()=>{window.showDirectoryPicker=async()=>{throw new DOMException('User cancelled','AbortError')}});
  await page.getByRole('button',{name:'Open folder',exact:true}).first().click();assert.equal(await page.getByRole('alert').count(),0);pass('cancelled folder picker is silent');
  await load('final.stdf',syntheticStdf());await page.getByRole('button',{name:'Run options'}).click();await page.getByRole('button',{name:'Clear recent runs',exact:true}).click();
  assert.equal(await page.locator('.recent-file').count(),0);assert.equal(await page.locator('.active-file small').innerText(),'final.stdf');pass('clear history preserves active run; reopen works after cancellation');
  assert.ok(await page.locator('a[href="https://www.linkedin.com/in/tim-chang-56bb1992/"]').count());assert.match(await page.locator('.brand').innerText(),/STDF INSIGHT/);
  assert.deepEqual(errors,[]);pass('brand/author preserved; no browser runtime errors');
}catch(error){
  errors.push(error.message);
  throw error;
}finally{
  fs.writeFileSync(path.join(output,'ui-results.json'),JSON.stringify({passed,errors},null,2));
  await browser.close();
}
