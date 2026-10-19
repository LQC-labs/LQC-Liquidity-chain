import fs from 'node:fs';
import path from 'node:path';
export function openJournal(directory){
 fs.mkdirSync(directory); // Exclusive run directory: existing evidence is never overwritten.
 const fd=fs.openSync(path.join(directory,'journal.jsonl'),'ax');
 return {
  persist(event){const bytes=Buffer.from(JSON.stringify(event)+'\n');if(fs.writeSync(fd,bytes)!==bytes.length)throw Error('JOURNAL_SHORT_WRITE');fs.fsyncSync(fd);},
  finish(result){fs.writeFileSync(path.join(directory,'observation.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});},
  close(){fs.closeSync(fd);}
 };
}
