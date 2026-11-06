export const MODES = Object.freeze(["ACTIVE","REDUCE_ONLY","HALTED"]);
export function modeNumber(value) {
  if(typeof value!=="number"&&typeof value!=="bigint")throw Error("시장 모드 응답을 검증할 수 없습니다.");
  const n=Number(value);
  if(!Number.isInteger(n)||n<0||n>2)throw Error("알 수 없는 시장 모드: 거래를 중단합니다.");
  return n;
}
export function requireEntry(mode,active,ready) {
  if(modeNumber(mode)!==0||active!==true||ready!==true)throw Error("신규 진입 불가: ACTIVE 및 현재 보호·청산 준비가 필요합니다.");
}
export function partialAmount(text,size,parseUnits) {
  if(!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(String(text)))throw Error("축소 수량은 양의 일반 십진수로 입력하세요(최대 소수 18자리).");
  const n=parseUnits(String(text),18);
  if(n<=0n||n>=size)throw Error("부분 축소 수량은 0보다 크고 현재 size보다 작아야 합니다. 전체 종료는 별도 버튼을 사용하세요.");
  return n;
}
export function requireFresh(price,updatedAt,now) {
  if(price<=0n||updatedAt<=0n||updatedAt>now)throw Error("Oracle 가격/시간이 유효하지 않습니다.");
  if(now-updatedAt>300n)throw Error("Oracle 가격이 300초를 초과했습니다. 갱신 후 다시 확인하세요.");
}
export function sameAddress(actual,expected,label) {
  if(typeof actual!=="string"||actual.toLowerCase()!==expected.toLowerCase())throw Error(label+" 연결 불일치");
}
export function exitNotice(mode) {
  return modeNumber(mode)===2
    ?"HALTED: 신규 진입·강제 청산은 중단됩니다. 자발적 축소·종료는 Engine 시뮬레이션이 허용한 경우만 가능합니다."
    :modeNumber(mode)===1
    ?"REDUCE_ONLY: 신규 진입 불가. 정상 축소·종료는 Engine 판정에 따라 가능합니다."
    :"ACTIVE: 거래별 Engine 검증이 필요합니다.";
}

