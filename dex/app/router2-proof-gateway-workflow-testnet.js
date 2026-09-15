(function(){
  "use strict";
  const KEYS={proof:"lqc-router2-proof-verifier-chain97-v1",gateway:"lqc-router2-proof-gateway-chain97-v1",deploymentFinal:"lqc-router2-proof-gateway-final-chain97-v1",readiness:"lqc-router2-proof-gateway-readiness-chain97-v1",execution:"lqc-router2-proof-gateway-execution-chain97-v1",executionFinal:"lqc-router2-proof-gateway-execution-final-chain97-v1"},HISTORY_KEY="lqc-router2-proof-gateway-execution-history-chain97-v1",MAX_HISTORY=20;
  const steps=[
    {id:"proof",title:"1. Proof 검증계약 배포",href:"./router2-proof-verifier-deploy-testnet.html"},
    {id:"gateway",title:"2. Proof Gateway 배포",href:"./router2-proof-gateway-deploy-testnet.html"},
    {id:"deploymentFinal",title:"3. 두 계약 온체인 최종검증",href:"./router2-proof-gateway-final-state-testnet.html"},
    {id:"readiness",title:"4. 실행 Proof 읽기 전용 준비검증",href:"./router2-proof-gateway-readiness-testnet.html"},
    {id:"execution",title:"5. Gateway 10 tLQC 1회 실행",href:"./router2-proof-gateway-execution-testnet.html"},
    {id:"executionFinal",title:"6. 실행 영수증 최종검증",href:"./router2-proof-gateway-execution-final-testnet.html"}
  ];
  function read(key){try{return JSON.parse(localStorage.getItem(key)||"null");}catch{return null;}}
  function refresh(){
    const records=Object.fromEntries(Object.entries(KEYS).map(([name,key])=>[name,read(key)])),readinessValid=Boolean(records.readiness&&Number(records.readiness.validUntil)*1000>Date.now());
    const done={proof:Boolean(records.proof?.address&&records.proof?.hash),gateway:Boolean(records.gateway?.address&&records.gateway?.hash),deploymentFinal:Boolean(records.deploymentFinal?.evidenceHash),readiness:readinessValid,execution:Boolean(records.execution?.transactionHash),executionFinal:Boolean(records.executionFinal?.evidenceHash)};
    const available={proof:true,gateway:done.proof,deploymentFinal:done.proof&&done.gateway,readiness:done.deploymentFinal,execution:done.execution||done.readiness,executionFinal:done.execution};
    steps.forEach(step=>{const row=document.querySelector('[data-step="'+step.id+'"]'),state=row.querySelector(".state"),link=row.querySelector("a");row.classList.toggle("done",done[step.id]);row.classList.toggle("locked",!available[step.id]);link.href=available[step.id]?step.href:"#";link.setAttribute("aria-disabled",String(!available[step.id]));if(done[step.id])state.textContent="완료 ✓";else if(step.id==="readiness"&&records.readiness&&!readinessValid)state.textContent="만료됨 · 다시 검증";else if(available[step.id])state.textContent="진행 가능";else state.textContent="앞 단계 완료 필요";});
    const count=Object.values(done).filter(Boolean).length;document.getElementById("progress").textContent=count+"/6 완료";document.getElementById("newCycle").disabled=!done.executionFinal;document.getElementById("status").textContent=done.executionFinal?"전체 Proof Gateway 검증 완료. 같은 실행을 다시 하지 마세요. 다음 거래는 아래 ‘새 거래 주기 시작’을 누르세요.":"위에서부터 초록색 ‘진행 가능’ 단계 하나만 선택하세요.";
  }
  function newCycle(){
    const readiness=read(KEYS.readiness),execution=read(KEYS.execution),executionFinal=read(KEYS.executionFinal);if(!execution?.transactionHash||!executionFinal?.evidenceHash){document.getElementById("status").textContent="최종검증까지 완료된 거래만 새 주기로 전환할 수 있습니다.";return;}if(!confirm("완료된 거래 증거를 기록함에 보관하고 새 10 tLQC 테스트 거래를 준비할까요?"))return;
    if(!window.ethers){document.getElementById("status").textContent="이력 봉인 라이브러리를 불러오지 못했습니다. 기록을 변경하지 않았습니다.";return;}const history=read(HISTORY_KEY)||[],core={format:"LQC_PROOF_GATEWAY_EXECUTION_ARCHIVE_V1",archivedAt:Date.now(),transactionHash:execution.transactionHash,readiness,execution,executionFinal},archiveHash=ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(core)));history.push({...core,archiveHash});localStorage.setItem(HISTORY_KEY,JSON.stringify(history.slice(-MAX_HISTORY)));for(const key of [KEYS.readiness,KEYS.execution,KEYS.executionFinal])localStorage.removeItem(key);refresh();document.getElementById("status").textContent="이전 거래 증거를 Hash로 봉인해 보관했습니다. 4단계에서 새 견적과 새 Proof를 만드세요.";
  }
  document.getElementById("refresh").addEventListener("click",refresh);document.getElementById("newCycle").addEventListener("click",newCycle);window.addEventListener("pageshow",refresh);refresh();
})();
