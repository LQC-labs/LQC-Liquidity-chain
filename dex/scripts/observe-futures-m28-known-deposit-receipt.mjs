// M28 — known historical deposit token Transfer/Deposit receipt linkage.
// BSC Testnet chain 97, pinned M08 block; read-only JSON-RPC; no signer.
import {ethers} from "ethers";
import {writeFileSync} from "node:fs";

const RPC=process.env.BSC_TESTNET_READONLY_RPC || "https://bsc-testnet-rpc.publicnode.com";
const provider=new ethers.JsonRpcProvider(RPC,97,{staticNetwork:true});
const TOKEN="0x7ab1b97d194730e9456c12af7905450a4f8a0c46";
const VAULT="0xb532c65294a7b35ca510a7df025e934fa17c8d7e";
const ACCOUNT="0xde05e09db1292aff6ab62164134f1ad384bca6fb";
const TX="0x00a756b77545a0ddc732f424f81c179c7d71119427108a50a1e43fa56be988f1";
const BLOCK=144115366;
const HASH="0x7a0d76a80ecc8b13d9eb7e2f1c7a5e3f96f16d3233d8d02c3f842c95a07d6208";
const tokenIface=new ethers.Interface(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
const vaultIface=new ethers.Interface(["event Deposit(address indexed account,address indexed token,uint256 amount)"]);
const result={
 schema:"lqc-m28-known-deposit-receipt-observation-v1",chainId:97,
 snapshotBlock:BLOCK,snapshotHash:HASH,depositTx:TX,token:TOKEN,vault:VAULT,knownAccount:ACCOUNT,
 status:"BLOCKED",provenDistributableSurplus:"0",fullHistoricalInventoryComplete:false,
 independentRpcAttestationComplete:false,operationalPayoutAuthorized:false,
 signingPerformed:false,transactionOccurred:false
};
try{
 if(BigInt(await provider.send("eth_chainId",[]))!==97n)throw Error("wrong chainId");
 const pinned=await provider.getBlock(BLOCK);
 if(!pinned||pinned.hash?.toLowerCase()!==HASH)throw Error("M08 pinned block hash mismatch");
 const receipt=await provider.getTransactionReceipt(TX);
 if(!receipt||receipt.status!==1||receipt.blockNumber>BLOCK)throw Error("deposit receipt missing or failed");
 const deposits=[],transfers=[];
 for(const log of receipt.logs){
  if(log.address.toLowerCase()===VAULT){
   try{
    const ev=vaultIface.parseLog(log);
    if(ev?.name==="Deposit")
     deposits.push({index:log.index,account:ev.args.account.toLowerCase(),
       token:ev.args.token.toLowerCase(),amount:ev.args.amount.toString()});
   }catch{}
  }
  if(log.address.toLowerCase()===TOKEN){
   try{
    const ev=tokenIface.parseLog(log);
    if(ev?.name==="Transfer")
     transfers.push({index:log.index,from:ev.args.from.toLowerCase(),
       to:ev.args.to.toLowerCase(),amount:ev.args.value.toString()});
   }catch{}
  }
 }
 const deposit=deposits.find(x=>x.index===7&&x.account===ACCOUNT&&x.token===TOKEN);
 if(!deposit)throw Error("known M08 Vault Deposit log index 7 not present");
 const matching=transfers.filter(x=>x.from===ACCOUNT&&x.to===VAULT&&
    x.amount===deposit.amount&&x.index<deposit.index);
 if(matching.length!==1)throw Error("ERC20 Transfer not uniquely matched to Vault Deposit");
 result.deposit={...deposit,blockNumber:receipt.blockNumber};
 result.erc20Transfer=matching[0];
 result.receiptBlockHash=receipt.blockHash;
 result.status="KNOWN_DEPOSIT_RECEIPT_MATCHED__GLOBAL_PROVENANCE_BLOCKED";
 result.reason="Known historical deposit Transfer and Deposit match in a receipt. Other transfers, users, claims, and independent complete coverage still unverified.";
}catch(e){
 result.reason=String(e?.shortMessage||e?.message||e).slice(0,450);
}
writeFileSync("futures-m28-known-deposit-receipt.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result,null,2));
