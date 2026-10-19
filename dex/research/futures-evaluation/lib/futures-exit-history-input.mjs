import fs from 'node:fs';
import { EXPECTED_MANIFEST_SHA256 } from './trust-anchor.mjs';
import { canonical, record, validateScope, compareScope, validateRequest, decimals, validatePrice } from './input-schema.mjs';
export { canonical } from './input-schema.mjs';
import { createHash } from 'node:crypto';
import { AbiCoder, keccak256, toUtf8Bytes, getAddress } from 'ethers';

// Pure offline evidence verification. No RPC, signer, token calls or file writes.
// The operator pin is a trust root and MUST NOT come from submitted history.
const sources = new WeakMap();
const abi = AbiCoder.defaultAbiCoder();
const MAX = (1n << 256n) - 1n;
const integer = value => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw Error('INVALID_UINT_ENCODING');
  const n = BigInt(value);
  if (n > MAX) throw Error('UINT256_OVERFLOW');
  return n;
};
const equal = (a, b, reason) => { if (a !== b) throw Error(reason); };
const bytes32 = value => {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw Error('INVALID_BYTES32');
  return value.toLowerCase();
};
export const commitment = value => keccak256(toUtf8Bytes(canonical(value)));
export function classifyTimestamp(timestamp, cutoff) {
  const t = integer(timestamp), E = integer(cutoff);
  return t < E ? 'BEFORE_E' : t === E ? 'AT_E' : 'AFTER_E';
}
function transition(raw) {
  if (!Array.isArray(raw) || raw.length !== 8) throw Error('INVALID_SOURCE_TRANSITION');
  const [timestamp, pid, sequence, oldL, oldS, nextL, nextS] = raw.slice(0, 7).map(x => integer(x).toString());
  return { timestamp, pid, sequence, oldL, oldS, nextL, nextS, receipt: bytes32(raw[7]) };
}
function receiptFor(key, t) {
  return keccak256(abi.encode(['bytes32','uint256','uint256','uint256','uint256','uint256','uint256'], [key,t.sequence,t.timestamp,t.oldL,t.oldS,t.nextL,t.nextS]));
}
function deepFreeze(x) { if (x && typeof x === 'object') { for (const v of Object.values(x)) deepFreeze(v); Object.freeze(x); } return x; }

function createPinnedOriginalSource(evidenceBytes, operatorPin) {
  if (!operatorPin || !/^[0-9a-f]{64}$/.test(operatorPin.sha256)) throw Error('OPERATOR_PIN_REQUIRED');
  const bytes = Buffer.from(evidenceBytes);
  equal(createHash('sha256').update(bytes).digest('hex'), operatorPin.sha256, 'SOURCE_HASH_MISMATCH');
  const evidence = JSON.parse(bytes.toString('utf8'));
  equal(evidence.status, 'PASS', 'SOURCE_NOT_COMPLETED');
  const snapshot = evidence.stages?.at(-1)?.snapshot;
  if (!snapshot?.financial?.state || !Array.isArray(snapshot.gaps)) throw Error('UNSUPPORTED_SOURCE_SCHEMA');
  if (evidence.connection?.status !== '4' || evidence.connection?.profile !== '3') throw Error('SOURCE_REGISTRY_CONTEXT_MISMATCH');
  const peers = evidence.connection.pins;
  if (!Array.isArray(peers) || peers.length !== 12) throw Error('SOURCE_PEER_CONTEXT_MISSING');
  for (const p of peers) { getAddress(p.address); bytes32(p.runtimeHash); }
  const context = {
    evidenceSha256: operatorPin.sha256,
    kind: 'PINNED_LOCAL_RECORDED_VIEWS',
    registry: getAddress(evidence.connection.registry),
    domain: integer(evidence.connection.domain).toString(),
    token: getAddress(snapshot.financial.state.domain[0]),
    collateralDecimals: decimals(snapshot.financial.state.domain[6]),
    marketOracle: getAddress(snapshot.financial.state.domain[1]),
    collateralOracle: getAddress(snapshot.financial.state.domain[2]),
    core: getAddress(peers[0].address), funding: getAddress(peers[1].address),
    partial: getAddress(peers[2].address), attribution: getAddress(peers[4].address),
    peerPins: peers.map(p => ({ address: getAddress(p.address), runtimeHash: bytes32(p.runtimeHash) }))
  };
  const observedScope = { chainId:evidence.chainId??null, evidenceSchema:evidence.schema??null, registry:evidence.connection.registry, contracts:peers.map(p=>({address:p.address,runtimeHash:p.runtimeHash})), queryBlock:evidence.queryBlock??{number:null,hash:null} };
  const scopeResult=compareScope(operatorPin.expectedScope,observedScope);
  context.manifestSha256=EXPECTED_MANIFEST_SHA256;context.scope=observedScope;context.scopeStatus=scopeResult.status;context.scopeBlockers=scopeResult.blockers;
  context.trust='LOCAL_REVIEW_PIN_ONLY';
  const source = Object.freeze({ context: deepFreeze(context) });
  sources.set(source, deepFreeze({ evidence, snapshot, context }));
  return source;
}

function readOriginal(source, pid) {
  const data = sources.get(source);
  if (!data) throw Error('PINNED_SOURCE_REQUIRED');
  integer(pid);
  const { evidence, snapshot, context } = data;
  const positions = snapshot.financial.state.positions.filter(p => p.pid === pid);
  const gaps = snapshot.gaps.filter(p => p.pid === pid);
  if (positions.length !== 1 || gaps.length !== 1) throw Error('SOURCE_POSITION_NOT_UNIQUE');
  const p = positions[0], g = gaps[0], ctx = p.context;
  const account = getAddress(p.position[0]), domain = p.position[1], series = p.position[2];
  equal(getAddress(ctx[0]), account, 'SOURCE_OWNER_MISMATCH');
  equal(domain, context.domain, 'SOURCE_DOMAIN_MISMATCH');
  equal(ctx[1][0], domain, 'SOURCE_CONTEXT_DOMAIN_MISMATCH');
  equal(ctx[1][1], series, 'SOURCE_CONTEXT_SERIES_MISMATCH');
  const seq = p.position[4], basis = p.basis, policy = bytes32(ctx[2]);
  equal(ctx[1][2], seq, 'SOURCE_FINAL_SEQUENCE_MISMATCH');
  equal(basis[5], seq, 'SOURCE_BASIS_SEQUENCE_MISMATCH');
  equal(p.ledgerSequence, seq, 'SOURCE_LEDGER_SEQUENCE_MISMATCH');
  equal(p.position[3], '0', 'SOURCE_POSITION_NOT_CLOSED');
  equal(ctx[1][3], '0', 'SOURCE_CONTEXT_NOT_CLOSED'); equal(ctx[1][4], '0', 'SOURCE_CONTEXT_NOT_CLOSED');
  equal(basis[3], basis[1], 'SOURCE_CLOSED_TOTAL_MISMATCH');
  const key = keccak256(abi.encode(['address','address','uint256','uint256','address','uint256','bytes32'], [context.core,context.funding,domain,series,account,pid,policy]));
  equal(key, bytes32(basis[0]), 'SOURCE_POSITION_KEY_MISMATCH');
  const transitions = g.transitions.map(transition);
  const accountKey = keccak256(abi.encode(['address','address','address','address','uint256','uint256','bytes32','address'], [context.attribution,context.partial,context.core,context.funding,domain,series,policy,account]));
  const accounts = snapshot.financial.attribution.filter(a => a.key.toLowerCase() === accountKey);
  if (accounts.length !== 1) throw Error('SOURCE_ACCOUNT_NOT_UNIQUE');
  const log = accounts[0].log;
  // This recorded-view adapter supports complete single-position account histories only.
  // Missing history or a larger account log is rejected, never silently filtered away.
  if (integer(log[0]) < 2n || integer(log[0]) > 256n) throw Error('SOURCE_ACCOUNT_COUNT_OUT_OF_BOUNDS');
  equal(BigInt(transitions.length), integer(log[0]), 'SOURCE_ACCOUNT_COUNT_MISMATCH');
  equal(integer(seq), BigInt(transitions.length), 'SOURCE_SEQUENCE_COUNT_MISMATCH');
  equal(log[1], '0', 'SOURCE_RESERVED_HISTORY'); equal(log[2], '0', 'SOURCE_LIVE_POSITION');
  equal(canonical(transition(accounts[0].first)), canonical(transitions[0]), 'SOURCE_FIRST_TRANSITION_MISMATCH');
  equal(canonical(transition(accounts[0].second)), canonical(transitions[1]), 'SOURCE_SECOND_TRANSITION_MISMATCH');
  const seriesData = snapshot.financial.state.series;
  equal(bytes32(seriesData[1]), policy, 'SOURCE_SERIES_POLICY_MISMATCH');
  const [origin, duration, epochs] = seriesData[0].slice(0,3).map(integer);
  if (duration === 0n || epochs === 0n || origin + duration * epochs > MAX) throw Error('SOURCE_INVALID_CUTOFF');
  const cutoff = (origin + duration * epochs).toString();
  equal(cutoff, evidence.E, 'SOURCE_CUTOFF_MISMATCH');
  let previousL = 0n, previousS = 0n, lastTime = origin, closed = 0n;
  const exits = [];
  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i], n = BigInt(i + 1);
    equal(t.pid, pid, 'SOURCE_MULTIPOSITION_HISTORY_UNSUPPORTED');
    equal(integer(t.sequence), n, 'SOURCE_SEQUENCE_GAP');
    const time = integer(t.timestamp), oldL = integer(t.oldL), oldS = integer(t.oldS), nextL = integer(t.nextL), nextS = integer(t.nextS);
    if (time < lastTime) throw Error('SOURCE_TIME_REVERSED');
    equal(oldL, previousL, 'SOURCE_OLD_OI_MISMATCH'); equal(oldS, previousS, 'SOURCE_OLD_OI_MISMATCH');
    if (nextL && nextS) throw Error('SOURCE_MIXED_SIDE');
    equal(receiptFor(key, t), t.receipt, 'SOURCE_RECEIPT_MISMATCH');
    const txs = evidence.transactions.filter(tx => tx.pid === pid && tx.sequence === t.sequence);
    if (txs.length !== 1 || txs[0].status !== 1 || !Number.isSafeInteger(txs[0].block) || txs[0].block < 0) throw Error('SOURCE_TRANSACTION_MISSING');
    equal(txs[0].timestamp, t.timestamp, 'SOURCE_TRANSACTION_TIME_MISMATCH');
    bytes32(txs[0].hash);
    if (i === 0) {
      equal(nextL + nextS, integer(basis[1]), 'SOURCE_INITIAL_QUANTITY_MISMATCH');
      if (time >= integer(cutoff)) throw Error('SOURCE_OPEN_AFTER_CUTOFF');
      equal(Boolean(nextL), p.position[5], 'SOURCE_SIDE_MISMATCH');
    } else {
      const quantity = oldL + oldS - nextL - nextS;
      if (quantity <= 0n || nextL > oldL || nextS > oldS) throw Error('SOURCE_INVALID_REDUCTION');
      closed += quantity;
      const final = nextL + nextS === 0n;
      const originalExit = g.exits.find(e => e.seq === Number(n));
      if (!originalExit) throw Error('SOURCE_EXIT_MISSING');
      const e = final ? originalExit.final : originalExit.partial;
      equal(e[0], final ? '2' : '3', 'SOURCE_EXIT_STATUS_MISMATCH');
      equal(e[1], t.timestamp, 'SOURCE_EXIT_TIME_MISMATCH');
      equal(e[3], closed.toString(), 'SOURCE_EXIT_CLOSED_MISMATCH');
      equal(e[8], cutoff, 'SOURCE_EXIT_CUTOFF_MISMATCH');
      equal(bytes32(e[10]), t.receipt, 'SOURCE_EXIT_RECEIPT_MISMATCH');
      if (final) equal(canonical(e), canonical(p.finalReceipt), 'SOURCE_FINAL_RECEIPT_MISMATCH');
      exits.push({ ...t, side:p.position[5] ? 'LONG' : 'SHORT', transactionHash:bytes32(txs[0].hash), block:String(txs[0].block), quantity: quantity.toString(), cumulativeClosed: closed.toString(), final,
        boundary: classifyTimestamp(t.timestamp, cutoff), entryPrice18: basis[7],
        observedPrice: { market18:e[4], collateral18:e[5], marketTime:e[6], collateralTime:e[7], trust:'RECORDED_LOCAL_MOCK_ONLY', unit:'FIXED_18' } });
    }
    previousL = nextL; previousS = nextS; lastTime = time;
  }
  for (const leg of exits) { integer(leg.entryPrice18); if(integer(leg.entryPrice18)===0n)throw Error('ZERO_ENTRY_PRICE');validatePrice(leg.observedPrice,leg.timestamp); }
  equal(previousL + previousS, 0n, 'SOURCE_FINAL_OI_NONZERO');
  equal(closed, integer(basis[3]), 'SOURCE_CLOSED_TOTAL_MISMATCH');
  equal(log[3], lastTime.toString(), 'SOURCE_ACCOUNT_LAST_TIME_MISMATCH');
  equal(g.gap[0][11], seq, 'SOURCE_GAP_SEQUENCE_MISMATCH');
  return deepFreeze({ context, account, pid, domain, series, policy, cutoff,
    originalAccountCount:log[0], finalSequence:seq, initialQuantity:basis[1], cumulativeClosed:closed.toString(), exits });
}
export function originalExitInputs(source, pid) {
  return structuredClone(readOriginal(source, pid).exits);
}

export function verifyExitHistory(source, submittedRequest) {
  const request=validateRequest(submittedRequest);
  const { pid, account, domain, series, submittedLegs, policyEvidence = null, priceEvidence = null } = request;
  const original = readOriginal(source, pid);
  if (getAddress(account) !== original.account || domain !== original.domain || series !== original.series) throw Error('REQUEST_SCOPE_MISMATCH');
  if (!Array.isArray(submittedLegs) || submittedLegs.length > 256) throw Error('INVALID_SUBMITTED_LIST');
  // Commit to every submitted byte-equivalent semantic field, evidence and original root.
  if(canonical(request.scope)!==canonical(original.context.scope))throw Error('REQUEST_SCOPE_MISMATCH');
  const inputCommitment = commitment({ schema:'LQC_EXIT_INPUT_V2', source:original.context, request });
  const errors = [];
  const add = (code, index = null) => errors.push({code,index});
  if (submittedLegs.length !== original.exits.length) add('EXIT_COUNT_MISMATCH');
  const seenSeq = new Set(), seenReceipt = new Set(); let previousSeq = 1n, previousTime = null, sum = 0n;
  for (let i = 0; i < submittedLegs.length; i++) {
    const leg = submittedLegs[i], expected = original.exits[i];
    try {
      const sequence = integer(leg.sequence), time = integer(leg.timestamp), quantity = integer(leg.quantity), receipt = bytes32(leg.receipt);
      if (seenSeq.has(leg.sequence) || seenReceipt.has(receipt)) add('DUPLICATE_EXIT',i);
      seenSeq.add(leg.sequence);seenReceipt.add(receipt);
      if (sequence !== previousSeq + 1n) add('SEQUENCE_ORDER_OR_GAP',i);
      if (previousTime !== null && time < previousTime) add('TIME_ORDER_MISMATCH',i);
      if (quantity === 0n) add('ZERO_QUANTITY',i);
      sum += quantity;previousSeq=sequence;previousTime=time;
      if (!expected) { add('UNEXPECTED_EXIT',i);continue; }
      for (const field of ['pid','side','sequence','timestamp','transactionHash','block','oldL','oldS','nextL','nextS','receipt','quantity','cumulativeClosed','final','boundary','entryPrice18','observedPrice']) {
        if (canonical(leg[field]) !== canonical(expected[field])) add(field === 'timestamp' ? 'TIMESTAMP_MISMATCH' : field === 'quantity' ? 'QUANTITY_MISMATCH' : 'ORIGINAL_FIELD_MISMATCH:'+field,i);
      }
    } catch { add('MALFORMED_EXIT',i); }
  }
  if (sum !== integer(original.cumulativeClosed)) add('CUMULATIVE_CLOSED_MISMATCH');
  if (previousSeq !== integer(original.finalSequence)) add('FINAL_SEQUENCE_MISMATCH');
  const blockers = [...original.context.scopeBlockers];
  if (errors.length) blockers.push('HISTORY_INVALID');
  blockers.push(policyEvidence === null ? 'POLICY_EVIDENCE_MISSING' : 'POLICY_EVIDENCE_NOT_VERIFIED');
  blockers.push(priceEvidence === null ? 'PRICE_EVIDENCE_MISSING' : 'PRICE_EVIDENCE_NOT_VERIFIED');
  // This phase intentionally implements no approved monetary policy/price verifier.
  // Presence of caller-supplied evidence can never grant evaluation or settlement rights.
  return {
    schema:'LQC_EXIT_INPUT_V2', inputCommitment,
    scopeStatus:original.context.scopeStatus, sourceTrust:'LOCAL_REVIEW_PIN_ONLY',
    sourceCommitment:commitment(original), sourceKind:original.context.kind,
    historyStatus:errors.length ? 'INVALID' : 'VALID', completenessBasis:{
      evidenceSha256:original.context.evidenceSha256, originalAccountCount:original.originalAccountCount,
      expectedExitCount:original.exits.length, finalSequence:original.finalSequence,
      initialQuantity:original.initialQuantity, cumulativeClosed:original.cumulativeClosed
    },
    evaluationStatus:'NOT_EVALUATED', monetaryResult:null,
    settlementAuthorized:false, fundsAuthority:false, blockers, errors,
    legs:errors.length ? [] : original.exits.map(leg=>({...structuredClone(leg),evaluationStatus:'NOT_EVALUATED',monetaryResult:null}))
  };
}
// Public loader: callers may supply bytes for transport, NEVER an expected hash or scope.
export function loadTrustedSource(options={}) {
 record(options,[],['manifestBytes','evidenceBytes']);
 const supplied=options.manifestBytes??fs.readFileSync(new URL('../trusted-manifest.json',import.meta.url));
 if(!(supplied instanceof Uint8Array))throw Error('MANIFEST_BYTES_REQUIRED');
 const bytes=Buffer.from(supplied);
 equal(createHash('sha256').update(bytes).digest('hex'),EXPECTED_MANIFEST_SHA256,'TRUSTED_MANIFEST_HASH_MISMATCH');
 const m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 record(m,['manifestSchema','source','expectedScope','unitPolicy','trust']);
 equal(m.manifestSchema,'LQC_LOCAL_EVIDENCE_MANIFEST_V2','MANIFEST_SCHEMA_MISMATCH');
 record(m.source,['path','sha256','adapterSchema']);
 equal(m.source.adapterSchema,'TASK_2_30_RECORDED_VIEWS_V1','ADAPTER_SCHEMA_MISMATCH');
 if(typeof m.source.path!=='string'||!m.source.path||!/^[0-9a-f]{64}$/.test(m.source.sha256))throw Error('INVALID_SOURCE_REFERENCE');
 validateScope(m.expectedScope);record(m.unitPolicy,['collateralDecimals','priceUnit']);
 equal(canonical(m.unitPolicy),canonical({collateralDecimals:['6','18'],priceUnit:'FIXED_18'}),'UNIT_POLICY_MISMATCH');
 equal(m.trust,'LOCAL_REVIEW_PIN_NOT_OPERATIONAL_APPROVAL_OR_CHAIN_PROOF','TRUST_STATEMENT_MISMATCH');
 const evidence=options.evidenceBytes??fs.readFileSync(new URL('../fixtures/task-2-30/target-evidence.json',import.meta.url));
 if(!(evidence instanceof Uint8Array))throw Error('EVIDENCE_BYTES_REQUIRED');
 return createPinnedOriginalSource(evidence,{sha256:m.source.sha256,expectedScope:m.expectedScope});
}
