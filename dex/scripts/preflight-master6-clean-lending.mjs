import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

function validatePacket(packet){
  const { packetDigest, ...body }=packet||{};
  if(packet?.recordType!=="LQC_MASTER6_CLEAN_TESTNET_DEPLOYMENT_PACKET") throw new Error("Invalid clean Lending packet type");
  if(packet?.status!=="REVIEW_REQUIRED"||packet?.network?.chainId!==97) throw new Error("Clean Lending packet must target BSC Testnet chain 97");
  if(packet?.activationAuthorized!==false||packet?.transactionOccurred!==false) throw new Error("Clean Lending packet must remain non-activating and unsigned");
  if(!Array.isArray(packet.deployments)||packet.deployments.length!==10) throw new Error("Clean Lending packet must contain 10 deployments");
  if(!Array.isArray(packet.configurationActions)||packet.configurationActions.length!==7) throw new Error("Clean Lending packet must contain 7 configuration actions");
  if(canonicalDigest(body)!==packetDigest) throw new Error("Clean Lending packet digest mismatch");
  if(packet.market?.enabled!==false) throw new Error("Clean Lending market must remain disabled before 6/13");
}
function stable(obs){
  return {
    chainId:obs.chainId,
    nonce:obs.nonce,
    balance:obs.balance,
    gasPrice:obs.gasPrice,
    predictedAddresses:obs.predictedAddresses,
    occupied:obs.occupied
  };
}

export async function preflightMaster6CleanLending({providers,packet}){
  validatePacket(packet);
  if(!Array.isArray(providers)||providers.length<2) throw new Error("Use 2+ BSC Testnet RPC providers");
  const deployer=ethers.getAddress(packet.deployer);
  const expectedNonce=BigInt(packet.startingNonce);

  const observations=await Promise.all(providers.map(async provider=>{
    const network=await provider.getNetwork();
    if(Number(network.chainId)!==97) throw new Error("Clean Lending RPC chain mismatch");
    const [nonce,balance,feeData]=await Promise.all([
      provider.getTransactionCount(deployer,"pending"),
      provider.getBalance(deployer),
      provider.getFeeData()
    ]);
    if(BigInt(nonce)!==expectedNonce) throw new Error("Clean Lending deployer nonce drift");
    const gasPrice=feeData.gasPrice??feeData.maxFeePerGas;
    if(gasPrice===null||BigInt(gasPrice)<=0n) throw new Error("Clean Lending gas price unavailable");

    const predictedAddresses=[];
    const occupied=[];
    const gas=[];
    for(const item of packet.deployments){
      const predicted=ethers.getCreateAddress({from:deployer,nonce:BigInt(item.deployerNonce)});
      if(predicted.toLowerCase()!==item.predictedAddress.toLowerCase()) throw new Error("Clean Lending predicted address mismatch");
      predictedAddresses.push(predicted);
      const code=await provider.getCode(predicted);
      occupied.push(code!=="0x");
      if(code!=="0x") throw new Error("Clean Lending predicted address already occupied");
      const estimate=await provider.estimateGas({from:deployer,data:item.data,value:0});
      gas.push(BigInt(estimate));
    }

    return {
      chainId:97,
      nonce:String(nonce),
      balance:String(balance),
      gasPrice:String(gasPrice),
      predictedAddresses,
      occupied,
      gas:gas.map(String)
    };
  }));

  const first=observations[0];
  for(const current of observations.slice(1)){
    const a=stable(first),b=stable(current);
    if(canonicalDigest(a)!==canonicalDigest(b)) throw new Error("Clean Lending RPC state disagreement");
    for(let i=0;i<first.gas.length;i++){
      const x=BigInt(first.gas[i]),y=BigInt(current.gas[i]),high=x>y?x:y,low=x>y?y:x;
      if(high===0n||(high-low)*100n>high*5n) throw new Error("Clean Lending gas estimate disagreement");
    }
  }

  const conservativeGas=packet.deployments.map((_,i)=>
    observations.reduce((max,o)=>BigInt(o.gas[i])>max?BigInt(o.gas[i]):max,0n)
  );
  const approvedGasLimits=conservativeGas.map(x=>x*120n/100n);
  const conservativeGasPrice=observations.reduce((max,o)=>BigInt(o.gasPrice)>max?BigInt(o.gasPrice):max,0n);
  const totalGasBudget=approvedGasLimits.reduce((sum,x)=>sum+x*conservativeGasPrice,0n);
  if(BigInt(first.balance)<totalGasBudget) throw new Error("Clean Lending deployer has insufficient testnet gas balance");

  const body={
    schemaVersion:1,
    recordType:"LQC_MASTER6_CLEAN_TESTNET_PREFLIGHT",
    status:"PREFLIGHT_VERIFIED_FOR_REVIEW",
    network:{name:"BSC Testnet",chainId:97},
    packetDigest:packet.packetDigest,
    sourceCommit:packet.sourceCommit,
    deployer,
    rpcCount:providers.length,
    deployerNonce:first.nonce,
    deployerBalance:first.balance,
    conservativeGasPrice:String(conservativeGasPrice),
    deployments:packet.deployments.map((item,i)=>({
      order:item.order,
      contract:item.contract,
      predictedAddress:item.predictedAddress,
      initCodeDigest:item.initCodeDigest,
      estimatedGas:String(conservativeGas[i]),
      approvedGasLimit:String(approvedGasLimits[i])
    })),
    totalGasBudgetWei:String(totalGasBudget),
    activationAuthorized:false,
    transactionOccurred:false,
    safety:"Read-only multi-RPC preflight only. No wallet, key, signature, Safe proposal, deployment, configuration, token movement or transaction."
  };
  return {...body,preflightDigest:canonicalDigest(body)};
}
