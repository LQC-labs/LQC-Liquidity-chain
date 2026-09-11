(function(root){
  'use strict';
  root.LQCLocales.en=Object.freeze({...root.LQCLocales.en,
    'status.recovering':'Recovering submitted trade {hash} after reload · verifying multi-RPC finality.',
    'status.recovered':'Recovered trade completed after {confirmations} blocks and received-amount verification.',
    'status.recoveredFailure':'The recovered trade failed on-chain. Failure was confirmed by multiple RPCs after {confirmations} blocks; trading is unlocked.',
    'status.pendingRecordInvalid':'The saved submitted-trade record is damaged or does not match this deployment. Trading is locked; do not resubmit until the original transaction is reviewed.',
    'status.lockUnsupported':'This browser cannot guarantee safe cross-tab trade locking. Update it or use a supported wallet browser.'
  });
  root.LQCLocales.ko=Object.freeze({...root.LQCLocales.ko,
    'status.recovering':'새로고침 전 제출된 거래 {hash}를 복구 중입니다 · 다중 RPC 확정성을 확인합니다.',
    'status.recovered':'복구된 거래가 {confirmations}블록·수령량 검증 후 완료되었습니다.',
    'status.recoveredFailure':'복구한 거래가 온체인에서 실패했습니다. 여러 RPC가 {confirmations}블록 후 실패를 확인하여 거래 잠금을 해제했습니다.',
    'status.pendingRecordInvalid':'저장된 제출 거래 기록이 손상되었거나 현재 배포와 일치하지 않습니다. 원래 거래를 확인하기 전까지 재전송하지 않도록 거래를 잠갔습니다.',
    'status.lockUnsupported':'이 브라우저는 탭 간 거래 잠금을 안전하게 보장하지 못합니다. 브라우저를 업데이트하거나 지원되는 지갑 브라우저를 사용하세요.'
  });
})(typeof window==='undefined'?globalThis:window);
