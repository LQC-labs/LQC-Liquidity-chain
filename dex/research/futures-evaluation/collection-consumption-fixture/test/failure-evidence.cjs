// Fixture-local evidence only; never changes assertion operands or verdicts.
const finalizations=new WeakMap();
function encode(value){
 const seen=new Map();
 function visit(v){
  if(typeof v==='bigint')return {$type:'bigint',decimal:v.toString(10)};
  if(v===undefined)return {$type:'undefined'};
  if(typeof v==='number'&&!Number.isFinite(v))return {$type:'number',value:String(v)};
  if(v===null||typeof v!=='object')return typeof v==='symbol'||typeof v==='function'?{$type:typeof v,value:String(v)}:v;
  if(seen.has(v))return {$ref:seen.get(v)};
  const id=seen.size+1;seen.set(v,id);
  // Own descriptors include nonenumerable actual/expected, stack, cause and errors.
  const properties=Object.create(null);
  for(const key of Object.getOwnPropertyNames(v)){
   const descriptor=Object.getOwnPropertyDescriptor(v,key);
   properties[key]='value' in descriptor?visit(descriptor.value):{$type:'accessor',notInvoked:true};
  }
  const record={$id:id,$type:Array.isArray(v)?'array':v instanceof Error?'error':'object',properties};
  if(finalizations.has(v))record.finalization=visit(finalizations.get(v));
  return record;
 }
 return visit(value);
}
function stringify(value){return JSON.stringify(encode(value),null,2)+'\n';}
async function finalize(write,cleanup){
 const failures=[];
 try{await write();}catch(error){failures.push({kind:'evidence',error});}
 try{await cleanup();}catch(error){failures.push({kind:'cleanup',error});}
 if(!failures.length)return;
 const first=failures[0].error;
 // Preserve the original thrown Error, including frozen Error objects.
 const primary=first!==null&&(typeof first==='object'||typeof first==='function')?first:new Error('Final hook failed',{cause:first});
 finalizations.set(primary,failures);throw primary;
}
function failureKinds(error,type){return [...new Set([type,...(finalizations.get(error)||[]).map(x=>x.kind)])];}
module.exports={encode,stringify,finalize,failureKinds};
