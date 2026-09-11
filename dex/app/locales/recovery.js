(function(root){
  'use strict';
  root.LQCLocales.en=Object.freeze({...root.LQCLocales.en,
    'status.recovering':'Recovering submitted trade {hash} after reload · verifying multi-RPC finality.',
    'status.recovered':'Recovered trade completed after {confirmations} blocks and received-amount verification.',
    'status.recoveredFailure':'The recovered trade failed on-chain. Failure was confirmed by multiple RPCs after {confirmations} blocks; trading is unlocked.'
  });
  root.LQCLocales.ko=Object.freeze({...root.LQCLocales.ko,
    'status.recovering':'새로고침 전 제출된 거래 {hash}를 복구 중입니다 · 다중 RPC 확정성을 확인합니다.',
    'status.recovered':'복구된 거래가 {confirmations}블록·수령량 검증 후 완료되었습니다.',
    'status.recoveredFailure':'복구한 거래가 온체인에서 실패했습니다. 여러 RPC가 {confirmations}블록 후 실패를 확인하여 거래 잠금을 해제했습니다.'
  });
})(typeof window==='undefined'?globalThis:window);
