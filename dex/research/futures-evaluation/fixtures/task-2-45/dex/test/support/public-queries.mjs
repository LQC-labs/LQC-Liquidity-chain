export const ZERO_ARG_PUBLIC = {
 LocalFuturesTradingCore:['domainRegistry','localFunding','localPartial','tradingPreflight','tradingPreflightCodeHash','governance','productionEnabled'],
 LocalFuturesFundingV11:['core','exposureLedger','collectionCoordinator','collectionExecutor','payoutSpecification','payoutExecutor','productionEnabled'],
 LocalFuturesPartialV11:['core','funding','attribution','withdrawalVerifier','withdrawalVerifierCodeHash','releaseVerifier','releaseVerifierCodeHash','linkedExposureVerifier','linkedExposureVerifierCodeHash','settlementCompletionConnected','productionEnabled'],
 LocalFuturesExposureLedger:['core','funding','productionEnabled'],
 LocalFuturesAttribution:['core','funding','partialSettlement','productionEnabled'],
 LocalFuturesSettlementCoordinator:['core','funding','partialSettlement','attribution','CALCULATION_POLICY','productionEnabled'],
 LocalFuturesCollectionExecutor:['core','funding','partialSettlement','coordinator','contextHash','fundingAuthorization','partialAuthorization','productionEnabled'],
 LocalFuturesPayoutSpecification:['core','funding','partialSettlement','coordinator','attribution','actualPaymentStatus','productionEnabled'],
 LocalFuturesPayoutExecutor:['core','funding','partialSettlement','coordinator','attribution','payoutSpecification','contextHash','actualPaymentStatus','actualSequenceAvailable','productionEnabled'],
 LocalFuturesWithdrawalVerifier:['core','funding','partialSettlement','productionEnabled'],
 LocalFuturesReleaseVerifier:['core','funding','partialSettlement','settlementCompletionVerifier','settlementCompletionVerifierCodeHash','productionEnabled'],
 LocalFuturesLinkedExposureVerifier:['core','funding','partialSettlement','productionEnabled'],
 LocalFuturesModularTradingDomainRegistry:['core','preparedStateVerifier','preparedStateVerifierCodeHash','operationPolicy','operationPolicyCodeHash','deploymentContext','VERSION','activated','cutoff','productionEnabled'],
 LocalFuturesPreparedStateVerifier:['core','registry','peerSetHash','productionEnabled'],
 LocalFuturesTradingOperationPolicy:['core','registry','peerSetHash','productionEnabled'],
 LocalFuturesTradingPreflightVerifier:['core','coreCodeHash','registry','registryCodeHash','attribution','attributionCodeHash','productionEnabled'],
 LocalVNextToken:['decimals','frozen','taxed'],LocalVNextOracle:['price','updatedAt','broken']
};
const PARAMETERS={
 LocalFuturesTradingCore:['domain','exposureBindings','exposurePositions','coreExposureContext','exposureAccountPosition','exposurePositionCount'],
 LocalFuturesFundingV11:['fundingSeries','fundingSeriesEpoch','fundingSeriesMember','fundingSeriesAccount','repeatCustody','repeatCash','policyGap','coreExposureSequences','repeatPayoutState','repeatAccountCollected'],
 LocalFuturesPartialV11:['partialPool','linkedBasis','linkedHeld','tokenAccounted','linkedPending','linkedFinalReserved','linkedExit','linkedConsumed','repeatReceiptState','withdrawals','returnWithdrawals','releasedReturnAvailable','lpShares','releases','lpObligationStatus'],
 LocalFuturesExposureLedger:['policyGapConfiguration','fundingSeriesMember'],
 LocalFuturesAttribution:['accountKey','logs','transition','finalOrdinal','traces'],
 LocalFuturesSettlementCoordinator:['plan','sealedPlan','latestIntegerSpecification','mockPolicy','integerSpecification','collectionQuote'],
 LocalFuturesCollectionExecutor:['consumedSpecifications','executions'],
 LocalFuturesPayoutExecutor:['rightsKey','progression'],LocalFuturesPayoutSpecification:['members'],
 LocalFuturesModularTradingDomainRegistry:['peers','approvedCodeHashes','registration','plannedPreparation','preparationContextHashes'],
 LocalVNextToken:['balanceOf','allowance']
};
export function publicMethods(name){return [...new Set([...(ZERO_ARG_PUBLIC[name]??[]),...(PARAMETERS[name]??[])])];}
export function assertPublicQuery(name,method){if(method==='validatePeers'||!publicMethods(name).includes(method))throw Error('PUBLIC_QUERY_NOT_ALLOWLISTED:'+name+'.'+method);}
export function describeAllowlist(artifact){
 const output=[];
 for(const name of Object.keys(ZERO_ARG_PUBLIC))for(const method of publicMethods(name)){
  assertPublicQuery(name,method);const abi=artifact(name).abi,f=abi.filter(f=>f.type==='function'&&f.name===method);
  if(f.length!==1||!['view','pure'].includes(f[0].stateMutability))throw Error('INVALID_PUBLIC_QUERY_ABI:'+name+'.'+method);
  output.push({artifact:name,method,signature:method+'('+f[0].inputs.map(x=>x.type).join(',')+')',arguments:f[0].inputs.map(x=>({name:x.name,type:x.type})),target:'recorded contract address for this artifact at Q',caller:'explicit collector: 0x0000000000000000000000000000000000000000; unchanged financial assertions: original signer, never Registry impersonation',blockTag:'Q.blockTag',requiredWhenScheduled:true,selection:'explicit collector calls or unchanged financial assertions'});
 }
 return output;
}