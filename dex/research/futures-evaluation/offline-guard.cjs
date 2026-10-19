const deny=()=>{throw Error('TASK_2_39_NETWORK_OR_PROCESS_FORBIDDEN');};
for(const name of ['node:net','node:tls','node:http','node:https','node:dgram','node:child_process']){
 const m=require(name);for(const key of ['connect','createConnection','request','get','createServer','createSocket','spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])if(typeof m[key]==='function')m[key]=deny;
}
globalThis.fetch=deny;globalThis.WebSocket=class{constructor(){deny();}};
require('node:module').syncBuiltinESMExports();