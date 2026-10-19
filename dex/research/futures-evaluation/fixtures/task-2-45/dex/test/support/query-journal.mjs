import fs from 'node:fs';
import path from 'node:path';
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v);
export function createJournal(file,runId){
 if(fs.existsSync(file))throw Error('JOURNAL_ALREADY_EXISTS');
 fs.writeFileSync(file,'');let next=0;const events=[];
 function append(event){const row={runId,...event};const fd=fs.openSync(file,'a');try{fs.writeSync(fd,json(row)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}events.push(row);return row;}
 async function invoke(request,operation){const id=++next;append({event:'REQUEST',id,request});try{const response=await operation();append({event:'RESPONSE',id,response});return response;}catch(error){append({event:'ERROR',id,error:{name:error.name,message:error.message,code:error.code??null,data:error.data??null},required:request.required===true});throw error;}}
 function summary(){const requests=events.filter(e=>e.event==='REQUEST'),responses=events.filter(e=>e.event==='RESPONSE'),errors=events.filter(e=>e.event==='ERROR');return {requests:requests.length,responses:responses.length,errors:errors.length,pending:requests.length-responses.length-errors.length,requiredFailures:errors.filter(e=>e.required).length};}
 function reject(request,error){append({event:'REJECTED_BEFORE_RPC',request,error:{name:error.name,message:error.message},rpcSubmitted:false});throw error;}return {invoke,append,summary,events,reject};
}
export function persistJson(file,value){const fd=fs.openSync(file,'w');try{fs.writeSync(fd,JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}