import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSubmission, validateModeration, isSameOrigin, parsePage, readFeedbackJson } from '../app/lib/feedback-validation.ts';
const valid = { id: '0bd56259-a555-4c44-9657-f2800aa0913a', nickname: ' Test ', category: 'feature', title: 'New feature', body: 'Please add a helpful feature.', consent: true, website: '' };
test('submission validation rejects malformed input, spam traps, missing consent, oversized content', () => {
  assert.equal(validateSubmission(valid).nickname, 'Test');
  for (const value of [null, [], {...valid,consent:false}, {...valid,website:'https://spam.test'}, {...valid,title:'a'}, {...valid,body:'x'.repeat(3001)}, {...valid,nickname:123}, {...valid,category:'admin'}, {...valid,id:'anything'}]) assert.equal(validateSubmission(value), null);
});
test('moderation accepts only known states and exact numeric revision', () => {
  const value = {moderation:'approved',status:'planned',reply:'Thanks',updatedAt:100};
  assert.ok(validateModeration(value));
  assert.equal(validateModeration({...value,updatedAt:'100'}),null);
  assert.equal(validateModeration({...value,moderation:'public'}),null);
  assert.equal(validateModeration({...value,reply:'x'.repeat(3001)}),null);
});
test('mutations require a matching origin and reject cross-site requests', () => {
  assert.ok(isSameOrigin(new Request('https://example.com/api/feedback',{headers:{origin:'https://example.com'}})));
  assert.equal(isSameOrigin(new Request('https://example.com/api/feedback')),false);
  assert.equal(isSameOrigin(new Request('https://example.com/api/feedback',{headers:{origin:'https://other.com'}})),false);
  assert.equal(isSameOrigin(new Request('https://example.com/api/feedback',{headers:{origin:'https://example.com','sec-fetch-site':'cross-site'}})),false);
});
test('pagination is bounded',()=>{
  assert.equal(parsePage(null),1); assert.equal(parsePage('2'),2);
  for(const page of ['0','-1','1.5','501','1x','']) assert.equal(parsePage(page),null);
});
test('JSON reader enforces content and streaming byte limits',async()=>{
  const request = (body,headers={})=>new Request('https://example.com/api/feedback',{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
  assert.deepEqual(await readFeedbackJson(request(JSON.stringify(valid))),valid);
  await assert.rejects(()=>readFeedbackJson(request('invalid')),e=>e.status===400);
  await assert.rejects(()=>readFeedbackJson(request('x'.repeat(16385))),e=>e.status===413);
  await assert.rejects(()=>readFeedbackJson(request('{}',{'Content-Type':'text/plain'})),e=>e.status===415);
});
