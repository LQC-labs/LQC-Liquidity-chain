// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// M23 research-only collateral/USD depeg admission oracle.
// No production activation, no automatic Registry privileges or token custody.
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

contract LQCFuturesM23CollateralDepegGuard {
    uint256 public constant ONE_USD = 1e18;
    uint256 public constant BPS = 10000;
    uint256 public constant MAX_QUOTE_AGE = 120 seconds;

    address public immutable collateral;
    address public immutable primaryFeed;
    address public immutable referenceFeed;
    uint256 public immutable minimumUsd18;
    uint16 public immutable maxDeviationBps;

    error InvalidConfiguration();
    error CollateralPriceUnavailable();

    constructor(
        address collateral_,address primary_,address reference_,uint256 minimumUsd18_,uint16 maxDeviationBps_
    ) {
        if(collateral_==address(0)||primary_==address(0)||reference_==address(0)||
           primary_==reference_||primary_.code.length==0||reference_.code.length==0||
           minimumUsd18_==0||minimumUsd18_>ONE_USD||maxDeviationBps_==0||maxDeviationBps_>5000)
            revert InvalidConfiguration();
        collateral=collateral_;
        primaryFeed=primary_;
        referenceFeed=reference_;
        minimumUsd18=minimumUsd18_;
        maxDeviationBps=maxDeviationBps_;
    }

    // Fail closed on stale, invalid, future, negative, missing or conflicting quotes.
    // These checks are NOT a proof that the two sources are economically independent.
    function collateralPriceUsd18() public view returns(uint256 price) {
        (uint256 a,)=_read(primaryFeed);
        (uint256 b,)=_read(referenceFeed);
        uint256 difference=a>b?a-b:b-a;
        if(difference>type(uint256).max/BPS)revert CollateralPriceUnavailable();
        if(difference*BPS>b*uint256(maxDeviationBps))revert CollateralPriceUnavailable();
        if(a<minimumUsd18||b<minimumUsd18)revert CollateralPriceUnavailable();
        // A prudent admission guard values at the lower observed feed.
        return a<b?a:b;
    }

    function admissionAllowed() external view returns(bool) {
        try this.collateralPriceUsd18() returns(uint256 price) {
            return price>=minimumUsd18;
        } catch {
            return false;
        }
    }

    function _read(address feed) internal view returns(uint256 price,uint256 updatedAt) {
        IAggregatorV3 source=IAggregatorV3(feed);
        try source.latestRoundData() returns(uint80 roundId,int256 answer,uint256,uint256 timestamp,uint80 answeredInRound){
            if(answer<=0||timestamp==0||timestamp>block.timestamp||
               block.timestamp-timestamp>MAX_QUOTE_AGE||answeredInRound<roundId)
                revert CollateralPriceUnavailable();
            updatedAt=timestamp;
            uint8 dec;
            try source.decimals() returns(uint8 d){dec=d;}
            catch{revert CollateralPriceUnavailable();}
            if(dec>18)revert CollateralPriceUnavailable();
            uint256 normalized=uint256(answer);
            uint256 factor=10**(18-dec);
            if(normalized>type(uint256).max/factor)revert CollateralPriceUnavailable();
            price=normalized*factor;
            if(price==0)revert CollateralPriceUnavailable();
        } catch {revert CollateralPriceUnavailable();}
    }
}
