(function(root){
  'use strict';
  root.LQCLocales.en=Object.freeze({...root.LQCLocales.en,
    'status.recovering':'Recovering submitted trade {hash} after reload · verifying multi-RPC finality.',
    'status.recovered':'Recovered trade completed after {confirmations} blocks and received-amount verification.',
    'status.recoveredFailure':'The recovered trade failed on-chain. Failure was confirmed by multiple RPCs after {confirmations} blocks; trading is unlocked.',
    'status.recoveredCancellation':'The cancellation was confirmed by multiple RPCs after {confirmations} blocks; trading is unlocked.',
    'recovery.retry':'Check submitted trade again',
    'recovery.explorer':'View submitted transaction',
    'status.pendingRecordInvalid':'The saved submitted-trade record is damaged or does not match this deployment. Trading is locked; do not resubmit until the original transaction is reviewed.',
    'status.approvalRecovering':'Recovering token approval {hash} after reload · verifying multi-RPC finality.',
    'status.approvalRecovered':'Token approval recovered and verified after {confirmations} blocks.',
    'status.approvalFailureRecovered':'The recovered token approval failed on-chain after {confirmations} blocks. Trading is unlocked.',
    'status.approvalCancellationRecovered':'The approval cancellation was verified after {confirmations} blocks. Trading is unlocked.',
    'status.approvalResultUnknown':'Token approval {hash} is not yet final. Trading remains locked to prevent duplicate approval or swap submission.',
    'status.pendingApprovalInvalid':'The saved token-approval record is damaged or does not match this deployment. Trading is locked for manual review.',
    'status.lockUnsupported':'This browser cannot guarantee safe cross-tab trade locking. Update it or use a supported wallet browser.',
    'error.storage_unavailable.message':'The trade recovery record cannot be stored safely.',
    'error.storage_unavailable.action':'Check browser storage and privacy settings, then try again.'
  });
  root.LQCLocales.ko=Object.freeze({...root.LQCLocales.ko,
    'status.recovering':'새로고침 전 제출된 거래 {hash}를 복구 중입니다 · 다중 RPC 확정성을 확인합니다.',
    'status.recovered':'복구된 거래가 {confirmations}블록·수령량 검증 후 완료되었습니다.',
    'status.recoveredFailure':'복구한 거래가 온체인에서 실패했습니다. 여러 RPC가 {confirmations}블록 후 실패를 확인하여 거래 잠금을 해제했습니다.',
    'status.recoveredCancellation':'취소 거래를 여러 RPC가 {confirmations}블록 후 확인하여 거래 잠금을 해제했습니다.',
    'recovery.retry':'제출한 거래 다시 확인',
    'recovery.explorer':'제출한 거래 탐색기에서 보기',
    'status.pendingRecordInvalid':'저장된 제출 거래 기록이 손상되었거나 현재 배포와 일치하지 않습니다. 원래 거래를 확인하기 전까지 재전송하지 않도록 거래를 잠갔습니다.',
    'status.approvalRecovering':'새로고침 전 제출된 토큰 승인 {hash}를 복구 중입니다 · 다중 RPC 확정성을 확인합니다.',
    'status.approvalRecovered':'토큰 승인이 {confirmations}블록 후 복구·검증되었습니다.',
    'status.approvalFailureRecovered':'복구한 토큰 승인이 온체인에서 실패했습니다. {confirmations}블록 확인 후 거래 잠금을 해제했습니다.',
    'status.approvalCancellationRecovered':'승인 취소 거래가 {confirmations}블록 후 검증되어 거래 잠금을 해제했습니다.',
    'status.approvalResultUnknown':'토큰 승인 {hash}가 아직 확정되지 않았습니다. 중복 승인이나 Swap 제출을 막기 위해 거래를 잠급니다.',
    'status.pendingApprovalInvalid':'저장된 토큰 승인 기록이 손상되었거나 현재 배포와 일치하지 않습니다. 수동 확인 전까지 거래를 잠급니다.',
    'status.lockUnsupported':'이 브라우저는 탭 간 거래 잠금을 안전하게 보장하지 못합니다. 브라우저를 업데이트하거나 지원되는 지갑 브라우저를 사용하세요.',
    'error.storage_unavailable.message':'거래 복구 기록을 안전하게 저장할 수 없습니다.',
    'error.storage_unavailable.action':'브라우저 저장 공간과 개인정보 보호 설정을 확인한 뒤 다시 시도하세요.'
  });
})(typeof window==='undefined'?globalThis:window);
