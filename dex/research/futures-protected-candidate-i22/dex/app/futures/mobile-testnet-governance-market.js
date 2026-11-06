import {POSITION_PROFILE} from './mobile-testnet-position-config.js';
import {createMarketPage,createGateway} from './mobile-testnet-market-page.js';
export const MARKET_PROFILE=Object.freeze({...POSITION_PROFILE,owner:POSITION_PROFILE.governanceOwner,symbol:'BTC/USDT',maxLeverage:100000n,maintenance:500n,reviewOnly:true});
export const page=createMarketPage({document,io:createGateway(window),profile:MARKET_PROFILE});page.mount();
