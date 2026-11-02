import type { TestData } from "./model.ts";

// Iteration avoids the engine argument limit without changing extrema semantics.
export function minimum(values:number[]){return values.reduce((min,value)=>Math.min(min,value),Infinity)}
export function maximum(values:number[]){return values.reduce((max,value)=>Math.max(max,value),-Infinity)}

export function stats(test:TestData){
  let n=0,sum=0,min=Infinity,max=-Infinity,failures=0;
  // Keep source order and the two-pass sample variance; avoid allocating arrays
  // for every test when a large run first appears.
  for(const measurement of test.values){
    if(!measurement.pass)failures++;
    const value=measurement.value;
    if(!Number.isFinite(value))continue;
    n++;sum+=value;min=Math.min(min,value);max=Math.max(max,value);
  }
  const failRate=failures/Math.max(test.values.length,1);
  if(!n)return{n:0,mean:NaN,sigma:NaN,min:NaN,max:NaN,cpk:null,failRate};
  const mean=sum/n;
  let squaredDeviations=0;
  if(n>1)for(const measurement of test.values){const value=measurement.value;if(Number.isFinite(value))squaredDeviations+=(value-mean)**2}
  const variance=n>1?squaredDeviations/(n-1):0,sigma=Math.sqrt(variance),cpu=test.high!==null&&sigma>0?(test.high-mean)/(3*sigma):Infinity,cpl=test.low!==null&&sigma>0?(mean-test.low)/(3*sigma):Infinity,cpk=Math.min(cpu,cpl);
  return{n,mean,sigma,min,max,cpk:Number.isFinite(cpk)?cpk:null,failRate};
}
