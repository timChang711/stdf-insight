// Generated test data only. No customer identifiers or production measurements.
export function syntheticStdf({little=true,version=4,parts=4,shortPrr=false,unfinished=false,invalid=false,defaults=true}={}){
  const chunks=[];
  const u2=(buffer,value,offset)=>little?buffer.writeUInt16LE(value,offset):buffer.writeUInt16BE(value,offset);
  const i2=(buffer,value,offset)=>little?buffer.writeInt16LE(value,offset):buffer.writeInt16BE(value,offset);
  const u4=(buffer,value,offset)=>little?buffer.writeUInt32LE(value,offset):buffer.writeUInt32BE(value,offset);
  const r4=(buffer,value,offset)=>little?buffer.writeFloatLE(value,offset):buffer.writeFloatBE(value,offset);
  const record=(type,sub,body)=>{const header=Buffer.alloc(4);u2(header,body.length,0);header[2]=type;header[3]=sub;chunks.push(header,body)};
  const cn=text=>Buffer.concat([Buffer.from([text.length]),Buffer.from(text)]);
  record(0,10,Buffer.from([little?2:1,version]));
  for(let index=0;index<parts;index++){
    const site=index%2+1;
    record(5,10,Buffer.from([1,site]));
    for(const [testId,name] of [[1001,'SYNTHETIC_VOLTAGE_LONG_TEST_NAME_FOR_RESPONSIVE_EXPLORER'],[1002,'SYNTHETIC_CURRENT']]){
      const ptr=Buffer.alloc(12);u4(ptr,testId,0);ptr[4]=1;ptr[5]=site;r4(ptr,invalid?NaN:index%4+1+(testId===1002?1:0),8);
      const first=index===0||!defaults;
      const option=Buffer.alloc(12);option[0]=0;option[1]=0;option[2]=0;option[3]=0;r4(option,0,4);r4(option,4,8);
      record(15,10,Buffer.concat([ptr,...(first?[cn(name),cn(''),option,cn('V')]:[])]));
    }
    if(unfinished&&index===parts-1)continue;
    const prr=Buffer.alloc(shortPrr?2:17);prr[0]=1;prr[1]=site;
    if(!shortPrr){prr[2]=index%4===3?8:0;u2(prr,2,3);u2(prr,prr[2]?5:1,5);u2(prr,prr[2]?5:1,7);i2(prr,index%20,9);i2(prr,Math.floor(index/20)%20,11);u4(prr,120,13)}
    record(5,20,prr);
  }
  return Buffer.concat(chunks);
}
