import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { parseStdfFile } from '../app/lib/stdf.ts';
import { collectRecordCoverage, recordDefinition } from '../app/lib/record-coverage.ts';
import { syntheticStdf } from './synthetic-stdf.mjs';

const file = (bytes, name='coverage.stdf') => new File([bytes], name, {lastModified:1700000000000});
function envelope(type, subtype, length, little=true) {
  const bytes=Buffer.alloc(4+length);
  if(little)bytes.writeUInt16LE(length);else bytes.writeUInt16BE(length);
  bytes[2]=type;bytes[3]=subtype;
  return bytes;
}

for(const little of [true,false])test(`inventory counts envelopes with exact ordinal/offset (${little?'LE':'BE'})`,async()=>{
  const base=syntheticStdf({parts:1,little});
  // Typed records use valid minimal optional tails; unknown payload stays opaque.
  const extras=[envelope(15,20,7,little),envelope(180,99,3,little),envelope(15,15,8,little),envelope(15,20,8,little)];
  const bytes=Buffer.concat([base,...extras]);
  const plain=await parseStdfFile(file(base)),run=await parseStdfFile(file(bytes));
  const coverage=run.recordCoverage;
  assert.equal(coverage.byteOrder,little?'little':'big');
  assert.equal(coverage.recordCount,9);
  assert.equal(coverage.uncompressedBytes,bytes.length);
  assert.deepEqual(coverage.records.map(row=>`${row.type}/${row.subtype}`),['0/10','5/10','15/10','5/20','15/20','180/99','15/15']);
  const ftr=coverage.records.find(row=>row.type===15&&row.subtype===20);
  assert.deepEqual(ftr,{type:15,subtype:20,count:2,bodyBytes:15,firstRecord:6,lastRecord:9,firstOffset:base.length,lastOffset:base.length+11+7+12});
  assert.equal(coverage.records.reduce((sum,row)=>sum+row.count,0),9);
  assert.equal(coverage.records.reduce((sum,row)=>sum+row.bodyBytes+row.count*4,0),bytes.length);
  assert.deepEqual(run.tests,plain.tests);
  assert.deepEqual(run.parts,plain.parts);
  assert.deepEqual(run.ignoredRecords,{ftr:2,mpr:1});
});

test('gzip inventory offsets use the uncompressed source and equal plain STDF',async()=>{
  const bytes=Buffer.concat([syntheticStdf(),envelope(50,30,0)]);
  const plain=await parseStdfFile(file(bytes));
  const compressed=await parseStdfFile(file(gzipSync(bytes),'coverage.stdf.gz'));
  assert.deepEqual(compressed.recordCoverage,plain.recordCoverage);
  assert.notEqual(compressed.fileSize,compressed.recordCoverage.uncompressedBytes);
});

test('known unsupported and unknown record types remain visibly undecoded',()=>{
  assert.equal(recordDefinition(15,10).support,'partial');
  assert.equal(recordDefinition(15,15).support,'partial');
  assert.equal(recordDefinition(15,20).support,'partial');
  assert.equal(recordDefinition(1,90).name,'PSR');
  assert.equal(recordDefinition(0,30).name,'VUR');
  assert.deepEqual(recordDefinition(180,99),{name:'Unrecognized',support:'not-decoded',usage:'Record type not recognized by this version'});
});

test('inventory memory grows with record types, not the number of records',()=>{
  const inventory=new Map();
  for(let i=0;i<100000;i++)collectRecordCoverage(inventory,15,20,7,i+1,i*11);
  assert.equal(inventory.size,1);
  assert.equal(inventory.get(15*256+20).count,100000);
  assert.equal(inventory.get(15*256+20).lastOffset,99999*11);
});

test('malformed opaque envelopes still reject the whole run',async()=>{
  const extra=envelope(180,99,3);
  await assert.rejects(parseStdfFile(file(Buffer.concat([syntheticStdf(),extra.subarray(0,-1)]))),/Truncated STDF record 180\/99/);
});
