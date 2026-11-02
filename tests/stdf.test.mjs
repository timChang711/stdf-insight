import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { parseStdfFile } from '../app/lib/stdf.ts';
import { syntheticStdf } from './synthetic-stdf.mjs';
import { createStdfBuilder } from './fixtures/typed-stdf.mjs';
const file=(bytes,name='synthetic.stdf')=>new File([bytes],name,{lastModified:1700000000000});

for(const little of [true,false])test(`parses ${little?'little':'big'}-endian values, optional defaults and dispositions`,async()=>{
  const run=await parseStdfFile(file(syntheticStdf({little})));
  assert.equal(run.parts.length,4);assert.equal(run.tests.length,2);
  assert.deepEqual(run.tests[0].values.map(x=>x.value),[1,2,3,4]);
  assert.deepEqual(run.tests[1].values.map(x=>x.pass),[true,true,true,false]);
  assert.equal(run.tests[0].unit,'V');assert.equal(run.tests[0].high,4);
  assert.deepEqual(run.parts.map(x=>x.pass),[true,true,true,false]);
  assert.equal(run.parts[3].firstFailTestId,1002);assert.equal(run.parts[3].x,3);
});
test('gzip produces the same measurement population',async()=>{
  const bytes=syntheticStdf(),plain=await parseStdfFile(file(bytes)),compressed=await parseStdfFile(file(gzipSync(bytes),'synthetic.stdf.gz'));
  assert.deepEqual(compressed.tests,plain.tests);assert.deepEqual(compressed.parts,plain.parts);
});
test('rejects malformed streams instead of returning partial data',async()=>{
  await assert.rejects(parseStdfFile(file(syntheticStdf({version:3}))),/Unsupported STDF version/);
  await assert.rejects(parseStdfFile(file(syntheticStdf({shortPrr:true}))),/Incomplete STDF record 5\/20/);
  await assert.rejects(parseStdfFile(file(syntheticStdf({unfinished:true}))),/missing PRR/);
  await assert.rejects(parseStdfFile(file(Buffer.concat([syntheticStdf(),Buffer.from([8,0,5,20,1])]))),/Truncated STDF record/);
  await assert.rejects(parseStdfFile(file(Buffer.concat([syntheticStdf(),Buffer.from([1])]))),/Incomplete STDF header/);
  await assert.rejects(parseStdfFile(file(Buffer.from('damaged gzip'),'broken.stdf.gz')),/gzip stream/);
});
test('abort before loading and during parsing never returns a run',async()=>{
  const before=new AbortController();before.abort();
  await assert.rejects(parseStdfFile(file(syntheticStdf()),{signal:before.signal}),{name:'AbortError'});
  const during=new AbortController();let progress=0;
  await assert.rejects(parseStdfFile(file(syntheticStdf({parts:2000})),{signal:during.signal,onProgress:fraction=>{progress=fraction;during.abort()}}),{name:'AbortError'});
  assert.ok(progress>0&&progress<1);
  const terminal=new AbortController();
  await assert.rejects(parseStdfFile(file(syntheticStdf()),{signal:terminal.signal,onProgress:fraction=>{if(fraction===1)terminal.abort()}}),{name:'AbortError'});
});
test('accepts omitted PRR and WCR tails and a default-only PTR outside a part',async()=>{
  const bytes=syntheticStdf({parts:1});
  // Replace the final 17-byte PRR body with only the required seven bytes.
  const prr=Buffer.from(bytes.subarray(bytes.length-21,bytes.length-10));prr.writeUInt16LE(7,0);
  const defaultPtr=Buffer.alloc(16);defaultPtr.writeUInt16LE(12,0);defaultPtr[2]=15;defaultPtr[3]=10;defaultPtr.writeUInt32LE(1001,4);defaultPtr[10]=16;
  const run=await parseStdfFile(file(Buffer.concat([bytes.subarray(0,-21),prr,Buffer.from([0,0,2,30]),defaultPtr])));
  assert.equal(run.parts[0].softBin,65535);assert.equal(run.parts[0].x,-32768);assert.equal(run.parts[0].y,-32768);assert.equal(run.parts[0].testTimeMs,0);
  assert.equal(run.tests[0].values.length,1);
});
test('reports unsupported record coverage without changing PTR or PRR results',async()=>{
  const source=syntheticStdf(),plain=await parseStdfFile(file(source));
  const ftr=Buffer.alloc(11);ftr.writeUInt16LE(7,0);ftr[2]=15;ftr[3]=20;
  const mpr=Buffer.alloc(12);mpr.writeUInt16LE(8,0);mpr[2]=15;mpr[3]=15;
  const run=await parseStdfFile(file(Buffer.concat([source,ftr,mpr])));
  assert.deepEqual(run.ignoredRecords,{ftr:1,mpr:1});
  assert.deepEqual(run.tests,plain.tests);assert.deepEqual(run.parts,plain.parts);
});

for(const little of [true,false])test(`repeated PTR metadata preserves changed defaults, individual flags and duplicate records (${little?'LE':'BE'})`,async()=>{
  const writer=createStdfBuilder({little});
  writer.pir();
  writer.ptr({testNumber:1001,value:1,name:'ORIGINAL',units:'V',low:0,high:4});
  writer.ptr({testNumber:1001,value:2,name:'ORIGINAL',units:'V',low:0,high:4,testFlag:128});
  writer.prr({tests:2,x:10,y:20});
  writer.pir();
  writer.ptr({testNumber:1001,value:100,name:'CHANGED',units:'mV',resultScale:-2,low:50,high:150,lowScale:-2,highScale:-2});
  writer.ptr({testNumber:1001,value:200,lastField:'RESULT'});
  writer.ptr({testNumber:1001,value:75,lastField:'RESULT'});
  writer.prr({tests:3,x:11,y:21});
  // Flags request the most recent defaults despite different numbers in the tail.
  for(const value of [100,200]){
    writer.pir();
    writer.ptr({testNumber:1001,value,name:'',units:'',optFlag:0x31,resultScale:2,low:-5,high:500});
    writer.prr({x:value,y:22});
  }
  const run=await parseStdfFile(file(writer.bytes()));
  const numeric=run.tests[0];
  assert.equal(numeric.name,'ORIGINAL');assert.equal(numeric.unit,'V');assert.equal(numeric.high,4);
  assert.deepEqual(numeric.values.map(({value,pass,partIndex,x,y})=>({value,pass,partIndex,x,y})),[
    {value:1,pass:true,partIndex:0,x:10,y:20},{value:2,pass:false,partIndex:0,x:10,y:20},
    {value:1,pass:true,partIndex:1,x:11,y:21},{value:2,pass:false,partIndex:1,x:11,y:21},{value:.75,pass:true,partIndex:1,x:11,y:21},
    {value:1,pass:true,partIndex:2,x:100,y:22},{value:2,pass:false,partIndex:3,x:200,y:22},
  ]);
  assert.deepEqual(run.parts.map(part=>part.firstFailTestId),[1001,1001,null,1001]);
  assert.equal(run.parts[0].values[1001],2);assert.equal(run.parts[1].values[1001],.75);
});

test('PTR buffering keeps interleaved heads and sites separate',async()=>{
  const writer=createStdfBuilder();
  for(const [head,site] of [[0,255],[1,0],[1,255],[255,255]])writer.pir({head,site});
  for(const [head,site,value] of [[0,255,1],[1,0,2],[1,255,3],[255,255,4]])writer.ptr({head,site,value});
  for(const [head,site,x] of [[255,255,44],[1,255,33],[1,0,22],[0,255,11]])writer.prr({head,site,x});
  const run=await parseStdfFile(file(writer.bytes()));
  assert.deepEqual(run.tests[0].values.map(({value,site,partIndex,x})=>({value,site,partIndex,x})),[
    {value:4,site:255,partIndex:0,x:44},{value:3,site:255,partIndex:1,x:33},
    {value:2,site:0,partIndex:2,x:22},{value:1,site:255,partIndex:3,x:11},
  ]);
});
