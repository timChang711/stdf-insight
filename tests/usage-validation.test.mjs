import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { validateUsage } from '../app/lib/usage-validation.ts';

test('usage accepts only coarse allowlisted event names and projects safe fields',()=>{
 const value={id:randomUUID(),visitorId:randomUUID(),event:'feature',name:'wafer',filename:'private.stdf',error:'sensitive detail'};
 const parsed=validateUsage(value);
 assert.ok(parsed);
 assert.deepEqual(Object.keys(parsed).sort(),['event','id','name','visitorId']);
 for(const invalid of [null,[],{...value,event:'__proto__'},{...value,name:'customer.stdf'},{...value,event:'page_view',name:'/feedback?secret=yes'},{...value,event:'error',name:'raw error text'},{...value,visitorId:'person@example.test'}]) assert.equal(validateUsage(invalid),null);
});
