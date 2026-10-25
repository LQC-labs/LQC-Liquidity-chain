import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {ethers} from 'ethers';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('..',import.meta.url));
// No archived output or absolute personal paths. The same gate runs before Mocha/Anvil.
const {output}=require('../build-common.cjs').validateBuild(root);
const names=new Map();for(const [source,contracts]of Object.entries(output.contracts))for(const [name,data]of Object.entries(contracts)){assert(!names.has(name),'DUPLICATE_ARTIFACT_NAME');names.set(name,{source,data});}
const declarations=new Map();function visit(x){if(!x||typeof x!=='object')return;if(x.nodeType==='VariableDeclaration'&&x.mutability==='immutable')declarations.set(x.id,x.name);for(const v of Object.values(x))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
for(const source of Object.values(output.sources))visit(source.ast);
export function artifact(name){assert(names.has(name),name);return names.get(name).data;}
export function expectedRuntime(name,values={}){
 const evm=artifact(name).evm;let hex=evm.deployedBytecode.object;
 for(const [id,refs]of Object.entries(evm.deployedBytecode.immutableReferences??{})){
  const key=declarations.get(Number(id));assert(Object.hasOwn(values,key),'unmapped immutable '+name+':'+key);
  const v=values[key],encoded=ethers.zeroPadValue(typeof v==='bigint'?ethers.toBeHex(v):v,32).slice(2);
  for(const r of refs){assert.equal(r.length,32);hex=hex.slice(0,r.start*2)+encoded+hex.slice((r.start+r.length)*2);}
 }return '0x'+hex;
}
export async function assertRuntime(provider,contract,name,values={}){const expected=expectedRuntime(name,values),actual=await provider.getCode(contract.target);assert.equal(actual.toLowerCase(),expected.toLowerCase(),'compiler full-runtime bytes '+name);return ethers.keccak256(expected);}
export async function deploy(name,signer,args=[]){const z=artifact(name),x=await new ethers.ContractFactory(z.abi,'0x'+z.evm.bytecode.object,signer).deploy(...args);await mined(x.deploymentTransaction());return x;}
export async function mined(p){const tx=await p,r=await tx.wait(1);assert.equal(r.status,1);return r;}
export const errors=[];
export async function rejects(contract,promise,name,label){try{await promise;assert.fail('expected '+name);}catch(e){let actual=e.revert?.name;try{actual??=contract.interface.parseError(e.data)?.name;}catch{}assert.equal(actual,name,label+': '+e.message);errors.push({label,expected:name,actual});}}
