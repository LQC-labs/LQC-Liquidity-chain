const fs=require('node:fs'),path=require('node:path'),evidence=require('./failure-evidence.cjs');
const assert=require('node:assert/strict');
function checked(root,relative,file){
 assert(typeof relative==='string'&&!path.isAbsolute(relative),'TAMPER_RELATIVE_PATH');
 const parts=relative.split('/');assert(parts.every(x=>x&&x!=='.'&&x!=='..'),'TAMPER_PATH_PART');
 assert(!fs.lstatSync(root).isSymbolicLink(),'TAMPER_ROOT_LINK');const base=fs.realpathSync(root);let current=root;
 for(const part of parts){current=path.join(current,part);assert(!fs.lstatSync(current).isSymbolicLink(),'TAMPER_LINK');assert(fs.realpathSync(current).startsWith(base+path.sep),'TAMPER_PATH_ESCAPE');}
 assert(file?fs.lstatSync(current).isFile():fs.lstatSync(current).isDirectory(),'TAMPER_PATH_TYPE');return current;
}
const checkedFile=(root,relative)=>checked(root,relative,true);
function checkedInput(file){
 const absolute=path.resolve(file),parts=absolute.slice(path.parse(absolute).root.length).split(path.sep);let current=path.parse(absolute).root;
 for(const part of parts){current=path.join(current,part);assert(!fs.lstatSync(current).isSymbolicLink(),'TAMPER_INPUT_LINK');}
 assert(fs.lstatSync(current).isFile(),'TAMPER_INPUT_TYPE');assert.equal(fs.realpathSync(current),absolute,'TAMPER_INPUT_REALPATH');return current;
}
function createOutput(root,relative){
 assert(relative.startsWith('results/'),'TAMPER_OUTPUT_ROOT');
 const parts=relative.split('/');let parent='';
 for(const part of parts){assert(part&&part!=='.'&&part!=='..','TAMPER_OUTPUT_PART');parent+=(parent?'/':'')+part;const target=path.join(root,parent);if(!fs.existsSync(target))fs.mkdirSync(target);checked(root,parent,false);}
 return checked(root,relative,false);
}
function record(root,out,name,value){
 checked(root,out,false);assert(/^[A-Za-z0-9.-]+$/.test(name),'TAMPER_OUTPUT_NAME');
 const target=path.join(root,out,name);fs.writeFileSync(target,JSON.stringify(value,(_key,item)=>typeof item==='bigint'?evidence.encode(item):item,2)+'\n',{flag:'wx'});
}
function errorRecord(error){return error===undefined?null:evidence.encode(error);}
module.exports={checkedFile,checkedInput,checkedDirectory:(root,relative)=>checked(root,relative,false),createOutput,record,errorRecord};
