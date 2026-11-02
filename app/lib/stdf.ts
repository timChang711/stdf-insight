import { gunzip } from "fflate";
import type { RunData, TestData, PartData, Measurement, WaferGeometry } from "./model.ts";
import { collectRecordCoverage } from "./record-coverage.ts";
import type { RecordCoverage } from "./record-coverage.ts";
import { decodeFtrRecord } from "./records/ftr.ts";
import { decodeMprRecord } from "./records/mpr.ts";
import { decodePmrRecord } from "./records/pmr.ts";
import { decodeTestFlags, decodePartFlags } from "./records/stdf-flags.ts";
import { createRecordDefaults } from "./records/defaults.ts";
import { typedObservationName } from "./typed-records.ts";
import type { TypedObservation, TypedTest, PinMapping, RecordDiagnostic, RecordReference } from "./typed-records.ts";
import { registerRecordSource } from "./record-source.ts";
import { RecordPayloadCache } from "./records/payload-cache.ts";

type PtrTail = { name: string; unit: string; resultScale?: number; low?: number; high?: number };
type PtrDefaults = { name: string; unit: string; resultScale: number; low: number | null; high: number | null; test: TestData; tail: PtrTail; tailStart: number; tailEnd: number };
const textDecoder = new TextDecoder("latin1");

export type ParseOptions = { signal?: AbortSignal; onProgress?: (fraction:number)=>void };

async function readFileBytes(file:File, signal?:AbortSignal):Promise<ArrayBuffer>{
  signal?.throwIfAborted();
  const raw=await file.arrayBuffer();
  signal?.throwIfAborted();
  if(!file.name.toLowerCase().endsWith(".gz"))return raw;
  return new Promise((resolve,reject)=>{
    const abort=()=>{terminate();reject(signal?.reason??new DOMException("Parsing cancelled", "AbortError"))};
    const terminate=gunzip(new Uint8Array(raw),(error,inflated)=>{
      signal?.removeEventListener("abort",abort);
      if(error){reject(new Error("The gzip stream is damaged or is not a valid compressed STDF file."));return}
      if(signal?.aborted){reject(signal.reason);return}
      resolve((inflated.byteOffset===0&&inflated.byteLength===inflated.buffer.byteLength?inflated.buffer:inflated.buffer.slice(inflated.byteOffset,inflated.byteOffset+inflated.byteLength)) as ArrayBuffer);
    });
    signal?.addEventListener("abort",abort,{once:true});
    if(signal?.aborted)abort();
  });
}

class Cursor {
  private view:DataView; pos:number; end:number; little:boolean;
  constructor(view:DataView,pos:number,end:number,little:boolean){this.view=view;this.pos=pos;this.end=end;this.little=little}
  remaining(n=1){return this.pos+n<=this.end} u1(){if(!this.remaining())return 0;return this.view.getUint8(this.pos++)} i1(){if(!this.remaining())return 0;return this.view.getInt8(this.pos++)}
  u2(){if(!this.remaining(2)){this.pos=this.end;return 0}const v=this.view.getUint16(this.pos,this.little);this.pos+=2;return v} i2(){if(!this.remaining(2)){this.pos=this.end;return 0}const v=this.view.getInt16(this.pos,this.little);this.pos+=2;return v}
  u4(){if(!this.remaining(4)){this.pos=this.end;return 0}const v=this.view.getUint32(this.pos,this.little);this.pos+=4;return v} r4(){if(!this.remaining(4)){this.pos=this.end;return NaN}const v=this.view.getFloat32(this.pos,this.little);this.pos+=4;return v}
  char(){return String.fromCharCode(this.u1())} cn(){const len=this.u1();if(!this.remaining(len)){this.pos=this.end;return""}if(!len)return"";const bytes=new Uint8Array(this.view.buffer,this.view.byteOffset+this.pos,len);this.pos+=len;return textDecoder.decode(bytes).replace(/\0/g,"").trim()}
  skipCn(){const len=this.u1();this.pos=Math.min(this.pos+len,this.end)}
}

function readPtrTail(c:Cursor):PtrTail{
  const tail:PtrTail={name:c.cn(),unit:""};c.skipCn();
  if(c.remaining()){
    const opt=c.u1(),resultScale=c.i1(),lowScale=c.i1(),highScale=c.i1(),rawLow=c.r4(),rawHigh=c.r4();tail.unit=c.cn();
    if((opt&1)===0)tail.resultScale=resultScale;
    if((opt&16)===0&&Number.isFinite(rawLow))tail.low=rawLow*10**lowScale;
    if((opt&32)===0&&Number.isFinite(rawHigh))tail.high=rawHigh*10**highScale;
  }
  return tail;
}

// Compare the entire metadata tail, never the changing PTR result or flags.
// Cache decoded fields only: blank/omitted values still resolve against the
// preceding defaults on EVERY record, including after a local metadata change.
function samePtrTail(bytes:Uint8Array,start:number,end:number,prior:PtrDefaults):boolean{
  if(end-start!==prior.tailEnd-prior.tailStart)return false;
  for(let offset=0;offset<end-start;offset++)if(bytes[start+offset]!==bytes[prior.tailStart+offset])return false;
  return true;
}

export async function parseStdfFile(file:File, options:ParseOptions = {}):Promise<RunData>{
  const { signal, onProgress } = options;
  const inventory = new Map<number, RecordCoverage>();
  signal?.throwIfAborted();
  const buffer=await readFileBytes(file, signal);if(buffer.byteLength<6)throw new Error("The file is too small to be an STDF stream.");const view=new DataView(buffer);
  const farLenLE=view.getUint16(0,true),farLenBE=view.getUint16(0,false);let little=farLenLE<=farLenBE;
  if(view.getUint8(2)!==0||view.getUint8(3)!==10)throw new Error("FAR record not found. Expected an STDF V4 file.");little=view.getUint8(4)!==1;
  if(view.getUint16(0,little)!==2)throw new Error("Invalid FAR record length. Expected two bytes.");
  if(view.getUint8(5)!==4)throw new Error("Unsupported STDF version. Select an STDF V4 file.");
  type BufferedPart = {site:number;values:Record<number,number>;measurements:Measurement[];tests:TestData[];firstFailTestId:number|null;typed:TypedObservation[]};
  const emptyPart=(site:number):BufferedPart=>({site,values:{},measurements:[],tests:[],firstFailTestId:null,typed:[]});
  const current=new Map<number,BufferedPart>();const openParts=new Set<number>();const testMap=new Map<number,TestData>(),ptrDefaults=new Map<number,PtrDefaults>();const parts:PartData[]=[];
  const typedMap=new Map<string,TypedTest>(),defaults=new Map<string,ReturnType<typeof createRecordDefaults>>();
  type CachedTypedPayload={raw:Record<string,unknown>;present:string[];trailingBytes:number;resolved:ReturnType<ReturnType<typeof createRecordDefaults>["resolve"]>;flags:ReturnType<typeof decodeTestFlags>};
  // Repeated source bodies can share immutable fields while every observation
  // keeps its own PRR link, source reference and diagnostic list.
  const payloadCaches=new Map<string,RecordPayloadCache<CachedTypedPayload>>();
  const pins:PinMapping[]=[],recordDiagnostics:RecordDiagnostic[]=[];
  let lotId="UNKNOWN_LOT",device="UNKNOWN_DEVICE",program="Unknown program",tester="Unknown tester",waferId="—",startTime=new Date(file.lastModified||Date.now()),finishTime=new Date(file.lastModified||Date.now()),waferGeometry:WaferGeometry|undefined,pos=0,recordCount=0,ftrRecords=0,mprRecords=0,lastYield=performance.now();
  const bytes=new Uint8Array(buffer),c=new Cursor(view,0,0,little);
  while(pos+4<=view.byteLength&&recordCount<8_000_000){const len=view.getUint16(pos,little),typ=view.getUint8(pos+2),sub=view.getUint8(pos+3),body=pos+4,end=body+len;if(end>view.byteLength)throw new Error(`Truncated STDF record ${typ}/${sub} at byte ${pos}. The run was not loaded.`);c.pos=body;c.end=end;
    if(typ===15&&sub===20)ftrRecords++;
    if(typ===15&&sub===15)mprRecords++;
    // Optional trailing fields may be omitted. Validate only required prefixes.
    const required = typ===0&&sub===10?2:typ===1&&sub===10?15:typ===1&&sub===20?4:typ===2&&sub===10?6:typ===5&&sub===10?2:typ===5&&sub===20?7:typ===15&&sub===20?7:typ===15&&(sub===10||sub===15)?8:0;
    if(len<required)throw new Error(`Incomplete STDF record ${typ}/${sub} at byte ${pos}: expected at least ${required} bytes.`);
    if(typ===15&&sub===10&&len<12&&(view.getUint8(body+6)&2)===0)throw new Error(`Missing PTR result at byte ${pos}. The run was not loaded.`);
    if(typ===5&&sub===20&&len<17&&![7,9,11,13].includes(len))throw new Error(`Truncated PRR field at byte ${pos}. The run was not loaded.`);
    collectRecordCoverage(inventory, typ, sub, len, recordCount + 1, pos);
    const reference:RecordReference={ordinal:recordCount+1,offset:pos,bodyLength:len,type:typ,subtype:sub};
    try{
      if(typ===1&&sub===10){c.u4();const started=c.u4();c.u1();c.char();c.char();c.char();c.u2();c.char();lotId=c.cn()||lotId;device=c.cn()||device;c.cn();tester=c.cn()||tester;program=c.cn()||program;if(started)startTime=new Date(started*1000)}
      else if(typ===1&&sub===20){const finished=c.u4();if(finished)finishTime=new Date(finished*1000)}
      else if(typ===2&&sub===10){c.u1();c.u1();const started=c.u4();waferId=c.cn()||waferId;if(started)startTime=new Date(started*1000)}
      else if(typ===2&&sub===30){const waferSize=c.r4(),dieHeight=c.r4(),dieWidth=c.r4(),units=c.u1();waferGeometry={waferSize:Number.isFinite(waferSize)&&waferSize>0?waferSize:null,dieWidth:Number.isFinite(dieWidth)&&dieWidth>0?dieWidth:null,dieHeight:Number.isFinite(dieHeight)&&dieHeight>0?dieHeight:null,units:units||null}}
      else if(typ===1&&sub===60){const {fields}=decodePmrRecord(view,body,end,little);pins.push({index:fields.PMR_INDX,channelType:fields.CHAN_TYP,channelName:fields.CHAN_NAM,physicalName:fields.PHY_NAM,logicalName:fields.LOG_NAM,head:fields.HEAD_NUM,site:fields.SITE_NUM,record:reference})}
      else if(typ===5&&sub===10){const head=c.u1(),site=c.u1(),key=head*256+site;if(current.has(key))recordDiagnostics.push({code:"replaced-part-buffer",message:"A PIR replaced an unfinished head/site buffer. Earlier typed records remain unassociated.",record:reference});openParts.add(key);current.set(key,emptyPart(site))}
      else if(typ===15&&(sub===20||sub===15)){
        const kind=sub===20?"FTR":"MPR",testNumber=view.getUint32(body,little),catalogKey=`${kind}:${testNumber}`;
        let cache=payloadCaches.get(catalogKey);if(!cache){cache=new RecordPayloadCache(view,32);payloadCaches.set(catalogKey,cache)}
        let payload=cache.get(body,end);
        if(!payload){
          const decoded=sub===20?decodeFtrRecord(view,body,end,little):decodeMprRecord(view,body,end,little),raw=decoded.fields as unknown as Record<string,unknown>;
          let resolver=defaults.get(catalogKey);if(!resolver){resolver=createRecordDefaults(kind);defaults.set(catalogKey,resolver)}
          payload={raw,present:decoded.present,trailingBytes:decoded.trailingBytes,resolved:resolver.resolve(raw,decoded.present,reference.ordinal),flags:decodeTestFlags(kind,Number(raw.TEST_FLG))};
          cache.set(body,end,payload);
        }
        const {raw,resolved,flags}=payload,head=Number(raw.HEAD_NUM),site=Number(raw.SITE_NUM),partKey=head*256+site;
        const observation:TypedObservation={kind,testNumber,head,site,partIndex:null,record:reference,verdict:flags.verdict,execution:flags.execution,diagnostics:[...flags.diagnostics],raw,effective:resolved.effective,present:payload.present,inherited:resolved.inherited};
        if(payload.trailingBytes)observation.diagnostics.push(`${payload.trailingBytes} trailing bytes are not interpreted.`);
        let test=typedMap.get(catalogKey);if(!test){test={key:catalogKey,kind,number:testNumber,name:typedObservationName(observation),observations:[]};typedMap.set(catalogKey,test)}
        else if(test.name===`${kind}_${testNumber}`)test.name=typedObservationName(observation);
        test.observations.push(observation);
        // Header/default records outside a part stay visible without fabricating a device.
        if(current.has(partKey))current.get(partKey)!.typed.push(observation);
        else if(flags.execution==="executed"){const part=emptyPart(site);part.typed.push(observation);current.set(partKey,part);observation.diagnostics.push("No preceding PIR for this head/site; association requires a following PRR.")}
      }
      else if(typ===15&&sub===10){
        const testId=c.u4(),head=c.u1(),site=c.u1(),testFlag=c.u1();c.u1();const rawValue=c.r4(),tailStart=c.pos,prior=ptrDefaults.get(testId);
        const tail=prior&&samePtrTail(bytes,tailStart,end,prior)?prior.tail:readPtrTail(c);
        const name=tail.name||prior?.name||`TEST_${testId}`,unit=tail.unit||prior?.unit||"",resultScale=tail.resultScale??prior?.resultScale??0,low=tail.low??prior?.low??null,high=tail.high??prior?.high??null;
        let meta:TestData;
        if(prior){meta=prior.test;prior.name=name;prior.unit=unit;prior.resultScale=resultScale;prior.low=low;prior.high=high;if(tail!==prior.tail){prior.tail=tail;prior.tailStart=tailStart;prior.tailEnd=end}}
        else{meta={id:testId,name,unit,low,high,values:[]};testMap.set(testId,meta);ptrDefaults.set(testId,{name,unit,resultScale,low,high,test:meta,tail,tailStart,tailEnd:end})}
        if(meta.name.startsWith("TEST_")&&!name.startsWith("TEST_"))meta.name=name;if(!meta.unit&&unit)meta.unit=unit;if(meta.low===null&&low!==null)meta.low=low;if(meta.high===null&&high!==null)meta.high=high;
        const value=rawValue*10**resultScale,key=head*256+site;let part=current.get(key);if(!part){part=emptyPart(site);current.set(key,part)}const pass=(testFlag&128)===0&&(low===null||value>=low)&&(high===null||value<=high);part.values[testId]=value;part.tests.push(meta);part.measurements.push({value,site,partIndex:-1,pass,x:-32768,y:-32768});if(!pass&&part.firstFailTestId===null)part.firstFailTestId=testId;
      } else if(typ===5&&sub===20){const head=c.u1(),site=c.u1(),flag=c.u1();c.u2();const hardBin=c.u2(),softBin=c.remaining(2)?c.u2():65535,x=c.remaining(2)?c.i2():-32768,y=c.remaining(2)?c.i2():-32768,testTime=c.remaining(4)?c.u4():0,key=head*256+site,buffered=current.get(key)||emptyPart(site),partIndex=parts.length,partPass=(flag&8)===0,firstFailTestId=buffered.firstFailTestId;
        parts.push({index:partIndex,site,head,rawFlags:flag,recordedVerdict:decodePartFlags(flag).verdict,record:reference,hardBin,softBin,pass:partPass,x,y,testTimeMs:testTime,values:buffered.values,firstFailTestId});for(const observation of buffered.typed)observation.partIndex=partIndex;for(let index=0;index<buffered.measurements.length;index++){const measurement=buffered.measurements[index];measurement.site=site;measurement.partIndex=partIndex;measurement.x=x;measurement.y=y;buffered.tests[index].values.push(measurement)}current.delete(key);openParts.delete(key)}
    }catch(error){throw new Error(`Could not decode STDF record ${typ}/${sub} at byte ${pos}: ${error instanceof Error?error.message:"invalid record"}`)}pos=end;recordCount++;
    if(recordCount%2048===0){onProgress?.(pos/view.byteLength);signal?.throwIfAborted();if(performance.now()-lastYield>=12){await new Promise<void>(resolve=>setTimeout(resolve,0));signal?.throwIfAborted();lastYield=performance.now()}}
  }
  signal?.throwIfAborted();
  if(pos!==view.byteLength)throw new Error(recordCount>=8_000_000?"The record safety limit was reached. This run was not loaded.":`Incomplete STDF header at byte ${pos}. The run was not loaded.`);
  if(openParts.size)throw new Error("The STDF stream ends with unfinished parts (missing PRR). The run was not loaded.");
  onProgress?.(1);
  signal?.throwIfAborted();
  const tests=[...testMap.values()].filter(t=>t.values.length).sort((a,b)=>a.id-b.id);
  for(const part of current.values())for(const observation of part.typed)observation.diagnostics.push("No closing PRR: this record is not associated with a completed part.");
  const run:RunData={fileName:file.name,fileSize:file.size,lotId,device,program,tester,startTime,finishTime,waferId,tests,parts,source:"file",waferGeometry,ignoredRecords:{ftr:ftrRecords,mpr:mprRecords},typedTests:[...typedMap.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.number-b.number),pins,recordDiagnostics,recordCoverage:{byteOrder:little?"little":"big",uncompressedBytes:buffer.byteLength,recordCount,records:[...inventory.values()]}};
  registerRecordSource(run,buffer,signal=>readFileBytes(file,signal));
  return run;
}
