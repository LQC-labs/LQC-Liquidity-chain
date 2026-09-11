(function(root){
  'use strict';
  function create({config,ethers,chartHealth}){
    if(!config||!ethers||!chartHealth)throw new Error('Invalid recovery validator configuration');
    const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
    return function validate(value){
      try{
        const quote=value?.anchorQuote,request=quote?.request,execution=quote?.execution,transaction=quote?.transaction,settlement=value?.settlementContext;
        if(!quote||!request||!execution||!transaction||!settlement)return false;
        const ttl=quote.expiresAt-quote.issuedAt,normalized=chartHealth.bindQuote(quote,quote.blockNumber,quote.blockHash,quote.issuedAt,ttl);
        if(!chartHealth.quoteBindingMatches(quote,normalized,quote.blockHash,quote.issuedAt)||!chartHealth.quoteRequestMatches(quote,request)||!chartHealth.executionPlanMatches(quote,execution,0)||!chartHealth.transactionMatches(quote,transaction))return false;
        if(request.chainId!==config.chainId||!same(request.router,config.quoteRouterAddress)||!same(execution.sender,execution.recipient)||!same(execution.recipient,settlement.recipient)||execution.minimumAmountOut!==settlement.minimumAmountOut)return false;
        const expectedRouter=execution.kind==='split'?config.autoRouterAddress:execution.kind==='single'?config.executionRouterAddress:['native-in','native-out'].includes(execution.kind)?config.nativeRouterAddress:'';
        if(!ethers.isAddress(expectedRouter)||!same(execution.router,expectedRouter))return false;
        if(execution.kind==='native-out')return settlement.kind==='native-out'&&same(settlement.nativeRouter,config.nativeRouterAddress)&&same(settlement.tokenIn,request.tokenIn)&&settlement.amountIn===request.amountIn;
        return settlement.kind==='erc20'&&same(settlement.tokenOut,request.tokenOut);
      }catch{return false}
    }
  }
  root.LQCRecoveryValidator=Object.freeze({create});
})(typeof window==='undefined'?globalThis:window);
