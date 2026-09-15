(function(){
  "use strict";
  const KEYS={proof:"lqc-router2-proof-verifier-chain97-v1",gateway:"lqc-router2-proof-gateway-chain97-v1",deploymentFinal:"lqc-router2-proof-gateway-final-chain97-v1",readiness:"lqc-router2-proof-gateway-readiness-chain97-v1",execution:"lqc-router2-proof-gateway-execution-chain97-v1",executionFinal:"lqc-router2-proof-gateway-execution-final-chain97-v1"};
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
    const count=Object.values(done).filter(Boolean).length;document.getElementById("progress").textContent=count+"/6 완료";document.getElementById("status").textContent=done.executionFinal?"전체 Proof Gateway 검증 완료. 같은 실행을 다시 하지 마세요.":"위에서부터 초록색 ‘진행 가능’ 단계 하나만 선택하세요.";
  }
  document.getElementById("refresh").addEventListener("click",refresh);window.addEventListener("pageshow",refresh);refresh();
})();
