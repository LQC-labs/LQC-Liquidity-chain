(function(){
  "use strict";
  const ADDRESS=/^0x[0-9a-fA-F]{40}$/,HASH=/^0x[0-9a-fA-F]{64}$/,DECIMAL=/^(0|[1-9][0-9]*)$/;
  const $=id=>document.getElementById(id);
  function status(message,type="info"){$("status").textContent=message;$("status").dataset.type=type;}
  function exactKeys(value,keys){const actual=Object.keys(value).sort(),expected=[...keys].sort();if(actual.length!==expected.length||actual.some((key,index)=>key!==expected[index]))throw new Error("허용되지 않은 필드가 있거나 필수 필드가 없습니다.");}
  function integer(value,name){if(!Number.isSafeInteger(value)||value<0)throw new Error(name+" 값이 올바르지 않습니다.");}
  function address(value,name){if(typeof value!=="string"||!ADDRESS.test(value))throw new Error(name+" 주소가 올바르지 않습니다.");}
  function hash(value,name){if(typeof value!=="string"||!HASH.test(value))throw new Error(name+" 해시가 올바르지 않습니다.");}
  function text(value,name){if(typeof value!=="string"||!value.trim()||value.length>500)throw new Error(name+" 값이 올바르지 않습니다.");}
  function buildCore(report){
    if(report.format!=="LQC_PROOF_GATEWAY_MONITOR_V1"||report.chainId!==97)throw new Error("지원하지 않는 형식 또는 네트워크입니다.");
    if(report.status==="PASS"){
      exactKeys(report,["format","status","chainId","blockNumber","proofVerifier","proofGateway","executionRouter","adapter","riskPaused","gatewayBalance","routerAllowance","lastProof","snapshotHash","checkedAt","reportHash"]);
      integer(report.blockNumber,"조회 블록");integer(report.checkedAt,"점검 시각");address(report.proofVerifier,"Proof");address(report.proofGateway,"Gateway");address(report.executionRouter,"Router");address(report.adapter,"Adapter");hash(report.lastProof,"마지막 Proof");hash(report.snapshotHash,"Snapshot");hash(report.reportHash,"Report");
      if(report.riskPaused!==false||!DECIMAL.test(report.gatewayBalance)||!DECIMAL.test(report.routerAllowance)||report.gatewayBalance!=="0"||report.routerAllowance!=="0")throw new Error("PASS 보고서의 안전 상태값이 올바르지 않습니다.");
      return{format:report.format,status:report.status,chainId:report.chainId,blockNumber:report.blockNumber,proofVerifier:report.proofVerifier,proofGateway:report.proofGateway,executionRouter:report.executionRouter,adapter:report.adapter,riskPaused:report.riskPaused,gatewayBalance:report.gatewayBalance,routerAllowance:report.routerAllowance,lastProof:report.lastProof,snapshotHash:report.snapshotHash,checkedAt:report.checkedAt};
    }
    if(report.status==="FAIL"){
      exactKeys(report,["format","status","chainId","code","message","action","checkedAt","reportHash"]);
      integer(report.checkedAt,"점검 시각");text(report.code,"진단 코드");text(report.message,"원인");text(report.action,"대응");hash(report.reportHash,"Report");
      return{format:report.format,status:report.status,chainId:report.chainId,code:report.code,message:report.message,action:report.action,checkedAt:report.checkedAt};
    }
    throw new Error("상태는 PASS 또는 FAIL이어야 합니다.");
  }
  function verify(){try{
    if(!window.ethers)throw new Error("검증 라이브러리를 불러오지 못했습니다.");const report=JSON.parse($("input").value),core=buildCore(report),computed=ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(core)));if(computed.toLowerCase()!==report.reportHash.toLowerCase())throw new Error("Report Hash가 일치하지 않습니다. 내용이 변경되었을 수 있습니다.");
    $("result").textContent=report.status+" · Chain "+report.chainId+" · "+new Date(report.checkedAt).toLocaleString();$("hash").textContent=report.reportHash;$("detail").textContent=report.status==="PASS"?"정상 점검 기록 · Gateway 잔액 0 · Router 승인 0":"이상 진단 "+report.code+"\n원인: "+report.message+"\n대응: "+report.action;status("검증 통과. 허용 필드·형식·Report Hash가 모두 일치합니다. 온체인 거래는 발생하지 않았습니다.","ok");
  }catch(error){$("result").textContent="검증 실패";$("hash").textContent="—";$("detail").textContent=error.message||String(error);status("검증 실패. 원본 JSON을 다시 확인하세요.","error");}}
  async function paste(){try{$("input").value=await navigator.clipboard.readText();status("클립보드 JSON을 불러왔습니다. 이제 2번 검증을 누르세요.");}catch(error){status("클립보드를 읽지 못했습니다. JSON을 입력칸에 직접 붙여넣으세요.","error");}}
  $("paste").addEventListener("click",paste);$("verify").addEventListener("click",verify);
})();
