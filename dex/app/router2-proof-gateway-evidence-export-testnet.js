(function(){
  "use strict";
  const SIGNER="0x7cf23bb16ed0e1eaf58cd31c9f5a643be438c6ab",KEYS={proof:"lqc-router2-proof-verifier-chain97-v1",gateway:"lqc-router2-proof-gateway-chain97-v1",deploymentFinal:"lqc-router2-proof-gateway-final-chain97-v1",readiness:"lqc-router2-proof-gateway-readiness-chain97-v1",execution:"lqc-router2-proof-gateway-execution-chain97-v1",executionFinal:"lqc-router2-proof-gateway-execution-final-chain97-v1"};
  const $=id=>document.getElementById(id);let exportText="";
  function status(message,type="info"){$("status").textContent=message;$("status").dataset.type=type;}
  function read(key){const raw=localStorage.getItem(key);if(!raw)return null;try{return JSON.parse(raw);}catch{throw new Error("브라우저 검증 기록 하나가 손상되었습니다.");}}
  function address(value,label){if(!/^0x[0-9a-fA-F]{40}$/.test(value||""))throw new Error(label+" 주소 형식이 잘못되었습니다.");return value.toLowerCase();}
  function hash(value,label){if(!/^0x[0-9a-fA-F]{64}$/.test(value||""))throw new Error(label+" 해시 형식이 잘못되었습니다.");return value.toLowerCase();}
  function build(){
    const records=Object.fromEntries(Object.entries(KEYS).map(([name,key])=>[name,read(key)])),stages={};
    if(records.proof)stages.proofVerifier={address:address(records.proof.address,"Proof"),transactionHash:hash(records.proof.hash,"Proof 거래")};
    if(records.gateway)stages.proofGateway={address:address(records.gateway.address,"Gateway"),transactionHash:hash(records.gateway.hash,"Gateway 거래"),proofVerifier:address(records.gateway.proofVerifier,"Gateway Proof"),executionRouter:address(records.gateway.executionRouter,"Execution Router")};
    if(records.deploymentFinal)stages.deploymentFinal={evidenceHash:hash(records.deploymentFinal.evidenceHash,"배포 Evidence"),proofBlock:Number(records.deploymentFinal.proofBlock),gatewayBlock:Number(records.deploymentFinal.gatewayBlock)};
    if(records.readiness)stages.executionReadiness={proofHash:hash(records.readiness.proofHash,"준비 Proof"),validUntil:Number(records.readiness.validUntil),selectedIndex:Number(records.readiness.selectedIndex)};
    if(records.execution)stages.execution={transactionHash:hash(records.execution.transactionHash,"실행 거래"),proofHash:hash(records.execution.proofHash,"실행 Proof"),gateway:address(records.execution.gateway,"실행 Gateway"),actualAmountOut:String(records.execution.actualAmountOut),blockNumber:Number(records.execution.blockNumber)};
    if(records.executionFinal)stages.executionFinal={transactionHash:hash(records.executionFinal.transactionHash,"최종 실행 거래"),blockHash:hash(records.executionFinal.blockHash,"실행 블록"),proofHash:hash(records.executionFinal.proofHash,"최종 Proof"),evidenceHash:hash(records.executionFinal.evidenceHash,"최종 Evidence"),confirmations:String(records.executionFinal.confirmations),amountIn:String(records.executionFinal.amountIn),amountOut:String(records.executionFinal.amountOut),residualAllowance:String(records.executionFinal.residualAllowance)};
    const core={schemaVersion:1,network:{name:"BSC Testnet",chainId:97},signer:SIGNER,stages},bundleHash=ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(core))),payload={...core,bundleHash,exportedAt:new Date().toISOString()};return{payload,count:Object.keys(stages).length};
  }
  function generate(){try{if(!window.ethers)throw new Error("ethers 검증 라이브러리를 불러오지 못했습니다.");const {payload,count}=build();exportText=JSON.stringify(payload,null,2);$("output").textContent=exportText;$("hash").textContent=payload.bundleHash;$("count").textContent=count+"/6";$("copy").disabled=false;status(count===6?"6단계 공개 검증자료를 모두 묶었습니다. 복사해서 전달할 수 있습니다.":"현재 완료된 "+count+"단계만 묶었습니다. 나중에 다시 생성하면 최신 완료 기록이 추가됩니다.","ok");}catch(error){status(error.message||String(error),"error");}}
  async function copy(){try{if(!exportText)throw new Error("먼저 1번 검증자료 생성을 실행하세요.");await navigator.clipboard.writeText(exportText);status("검증 JSON 복사 완료. 이 내용을 그대로 전달하면 됩니다.","ok");}catch(error){status("자동 복사 실패. 아래 JSON을 길게 눌러 직접 복사하세요: "+(error.message||String(error)),"error");}}
  $("generate").addEventListener("click",generate);$("copy").addEventListener("click",copy);
})();
