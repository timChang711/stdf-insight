import assert from 'node:assert/strict';
import test from 'node:test';
import { stats,minimum,maximum } from '../app/lib/statistics.ts';
const sample=(values,low=0,high=6)=>({id:1,name:'Synthetic',unit:'V',low,high,values:values.map((value,index)=>({value,pass:index!==0,site:1,partIndex:index,x:0,y:0}))});
test('preserves sample standard deviation, capability and fail population',()=>{
  const result=stats(sample([1,2,3,4,5]));
  assert.equal(result.mean,3);assert.equal(result.sigma,Math.sqrt(2.5));
  assert.equal(result.cpk,1/Math.sqrt(2.5));assert.equal(result.failRate,.2);
  assert.equal(result.min,1);assert.equal(result.max,5);
});
test('empty, one-sided and zero spread retain existing definitions',()=>{
  assert.equal(stats(sample([])).n,0);assert.equal(stats(sample([2,2])).cpk,null);
  assert.equal(stats(sample([1,2,3],null,6)).cpk,4/3);
});
test('150,000 measurements do not exceed the engine argument limit',()=>{
  const values=Array.from({length:150000},(_,i)=>i%5+1),result=stats(sample(values));
  assert.equal(result.n,150000);assert.equal(result.mean,3);assert.equal(result.min,1);assert.equal(result.max,5);
  assert.equal(minimum(values),1);assert.equal(maximum(values),5);
});

test('nonfinite measurements retain their recorded pass/fail denominator',()=>{
  const mixed=sample([NaN,2]);
  assert.equal(stats(mixed).n,1);assert.equal(stats(mixed).mean,2);assert.equal(stats(mixed).failRate,.5);
  const invalid=sample([NaN]);
  assert.equal(stats(invalid).n,0);assert.equal(stats(invalid).failRate,1);assert.ok(Number.isNaN(stats(invalid).mean));
});

test('statistics retain the original arithmetic for signed zero, nonfinite data and large magnitudes',()=>{
  // Independent array-based reference retains the previous arithmetic order.
  const reference=(data)=>{
    const numeric=data.values.map(item=>item.value).filter(Number.isFinite),n=numeric.length;
    const failRate=data.values.filter(item=>!item.pass).length/Math.max(data.values.length,1);
    if(!n)return{n:0,mean:NaN,sigma:NaN,min:NaN,max:NaN,cpk:null,failRate};
    const mean=numeric.reduce((sum,value)=>sum+value,0)/n;
    const sigma=Math.sqrt(n>1?numeric.reduce((sum,value)=>sum+(value-mean)**2,0)/(n-1):0);
    const cpk=Math.min(data.high!==null&&sigma>0?(data.high-mean)/(3*sigma):Infinity,data.low!==null&&sigma>0?(mean-data.low)/(3*sigma):Infinity);
    return{n,mean,sigma,min:Math.min(...numeric),max:Math.max(...numeric),cpk:Number.isFinite(cpk)?cpk:null,failRate};
  };
  const populations=[[],[-0],[-0,0],[NaN,Infinity,-Infinity],[NaN,2,Infinity,3,-Infinity],[-1e20,1e20,3,.1,.2],[Number.MAX_VALUE,Number.MAX_VALUE],[-Number.MAX_VALUE,Number.MAX_VALUE],[1e-200,2e-200]];
  for(const values of populations)for(const [low,high] of [[null,null],[0,null],[null,6],[0,6]]){
    const data=sample(values,low,high);
    assert.deepEqual(stats(data),reference(data));
  }
});

test('statistics reflect appended records and updated limits without stale cached results',()=>{
  const data=sample([1,2]);
  const before=stats(data);
  data.values.push({value:3,pass:false,site:1,partIndex:2,x:0,y:0});
  data.high=3;
  const after=stats(data);
  assert.equal(before.n,2);assert.equal(after.n,3);assert.equal(after.mean,2);
  assert.equal(after.sigma,1);assert.equal(after.cpk,1/3);assert.equal(after.failRate,2/3);
});
