import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {ethers} from 'ethers';

const roleOrder=['governance','risk','guardian','treasury'];
const policy={governance:{threshold:4,signerCount:7},risk:{threshold:3,signerCount:5},guardian:{threshold:3,signerCount:5},treasury:{threshold:3,signerCount:5}};
const exactKeys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key));
const forbidden=value=>Object.keys(value||{}).some(key=>/(private|secret|mnemonic|seed|password|key)/i.test(key));

export function prepareRoleAddressReview(input){
  if(!exactKeys(input,['schemaVersion','network','chainId','deployerAddress','roles'])||forbidden(input))throw new Error('Role review input contains unsupported or secret-bearing fields');
  if(input.schemaVersion!==1||input.network!=='bsc-testnet'||input.chainId!==97)throw new Error('Role review must target BSC testnet chain 97');
  if(!ethers.isAddress(input.deployerAddress))throw new Error('A valid public deployer address is required');
  if(!exactKeys(input.roles,roleOrder)||roleOrder.some(name=>!exactKeys(input.roles[name],['address','threshold','signerCount'])||forbidden(input.roles[name])))throw new Error('Exactly four public operational role records are required');
  const deployerAddress=ethers.getAddress(input.deployerAddress),roles={};
  for(const name of roleOrder){
    const value=input.roles[name],required=policy[name];
    if(!ethers.isAddress(value.address))throw new Error(`Invalid ${name} Safe address`);
    if(value.threshold!==required.threshold||value.signerCount!==required.signerCount)throw new Error(`${name} Safe must satisfy ${required.threshold}-of-${required.signerCount}`);
    roles[name]=Object.freeze({address:ethers.getAddress(value.address),threshold:value.threshold,signerCount:value.signerCount});
  }
  const addresses=[deployerAddress,...roleOrder.map(name=>roles[name].address.toLowerCase())];
  if(new Set(addresses.map(value=>value.toLowerCase())).size!==addresses.length)throw new Error('Deployer and operational role addresses must all be distinct');
  const reviewFingerprint=ethers.solidityPackedKeccak256(
    ['uint256','address','address','uint256','uint256','address','uint256','uint256','address','uint256','uint256','address','uint256','uint256'],
    [97,deployerAddress,...roleOrder.flatMap(name=>[roles[name].address,roles[name].threshold,roles[name].signerCount])]
  );
  return Object.freeze({schemaVersion:1,network:'bsc-testnet',chainId:97,deployerAddress,roles:Object.freeze(roles),reviewFingerprint,status:'READY_FOR_ONCHAIN_SAFE_VERIFICATION'});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const file=process.argv[2];
  if(!file)throw new Error('Usage: npm run prepare:role-review -- <public-role-addresses.json>');
  const input=JSON.parse(fs.readFileSync(file,'utf8'));
  process.stdout.write(`${JSON.stringify(prepareRoleAddressReview(input),null,2)}\n`);
}
