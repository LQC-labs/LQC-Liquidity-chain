// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IFundingCheckpointSource,IFundingCashAdapter,IFundingVaultView,IFundingTokenView} from './IFundingLedgerIntegration.sol';
import {LedgerMath} from './LedgerMath.sol';
/// Standalone candidate. Requires separately reviewed non-proxy Engine/Vault/Adapter implementations.
/// Runtime pins authenticate deployment identity, not the truth of an unaudited integration source.
contract FundingLedger {
    uint256 public constant MAX_BATCH=32;
    address public immutable engine;address public immutable vault;address public immutable adapter;
    bytes32 public immutable engineHash;bytes32 public immutable vaultHash;bytes32 public immutable adapterHash;
    uint256 public immutable epochBlocks;
    uint256 private entered;
    mapping(bytes32=>uint256) public lastNonce;
    mapping(bytes32=>uint256) public receivable;mapping(bytes32=>uint256) public payableAmount;
    mapping(address=>uint256) public totalReceivable;mapping(address=>uint256) public totalPayable;
    mapping(address=>uint256) public reservedCash;
    struct Claim {address account;uint256 market;address token;uint256 epoch;uint256 face;uint256 remaining;uint256 reserved;}
    struct Epoch {uint256 face;uint256 unfunded;bool isSealed;bool active;uint256 budget;uint256 denominator;uint256 cursor;uint256 allocated;uint256 round;uint256 lastZeroBudget;uint256 lastZeroDenominator;uint256[] ids;}
    uint256 public claimCount;
    mapping(uint256=>Claim) public claims;
    mapping(address=>mapping(uint256=>Epoch)) private epochs;
    mapping(bytes32=>mapping(uint256=>uint256)) private claimForEpoch;
    mapping(address=>uint256[]) private queues;mapping(address=>uint256) public head;
    mapping(address=>mapping(address=>uint256)) public accountPayable;
    struct Cash {uint256 pool;uint256 user;uint256 accounted;uint256 insurance;uint256 treasury;uint256 custody;}
    error Forbidden();error InvalidInput();error IntegrationMismatch();error DuplicateCheckpoint();error InvalidCheckpoint();error Reentrant();error CashMismatch();error Underfunded();error InvalidEpoch();error InvalidRound();error BatchLimit();
    event FundingBooked(address indexed account,uint256 indexed market,address indexed token,uint256 nonce,int256 amount,uint256 epoch,uint256 claimId);
    event FundingCollected(address indexed account,uint256 indexed market,address indexed token,uint256 amount,uint256 remainingPayable);
    event EpochSealed(address indexed token,uint256 indexed epoch,uint256 face,uint256 claims);
    event RoundStarted(address indexed token,uint256 indexed epoch,uint256 round,uint256 budget,uint256 denominator);
    event ClaimAllocated(uint256 indexed claimId,uint256 round,uint256 amount);
    event RoundFinished(address indexed token,uint256 indexed epoch,uint256 round,uint256 allocated,uint256 dust);
    event ClaimPaid(uint256 indexed claimId,address indexed account,uint256 amount,uint256 remaining);
    event HeadAdvanced(address indexed token,uint256 head);
    constructor(address e,address v,address a,bytes32 eh,bytes32 vh,bytes32 ah,uint256 blocks_){
        if(e.code.length==0||v.code.length==0||a.code.length==0||blocks_==0||e.codehash!=eh||v.codehash!=vh||a.codehash!=ah)revert InvalidInput();
        engine=e;vault=v;adapter=a;engineHash=eh;vaultHash=vh;adapterHash=ah;epochBlocks=blocks_;
    }
    modifier guard(){if(entered!=0)revert Reentrant();entered=1;_authenticate();_;entered=0;}
    modifier onlyEngine(){if(msg.sender!=engine)revert Forbidden();_;}
    function _authenticate() private view {
        if(engine.codehash!=engineHash||vault.codehash!=vaultHash||adapter.codehash!=adapterHash)revert IntegrationMismatch();
        if(IFundingCheckpointSource(engine).fundingLedger()!=address(this)||IFundingCashAdapter(adapter).fundingLedger()!=address(this)||IFundingCashAdapter(adapter).vault()!=vault||IFundingCashAdapter(adapter).engine()!=engine||IFundingVaultView(vault).engine()!=engine)revert IntegrationMismatch();
    }
    function key(address account,uint256 market,address token) public pure returns(bytes32){return keccak256(abi.encode(account,market,token));}
    function currentEpoch() public view returns(uint256){return block.number/epochBlocks;}
    function crystallize(address account,uint256 market,address token,uint256 nonce) external onlyEngine guard returns(uint256 id){
        if(account==address(0)||token.code.length==0||market==0)revert InvalidInput();bytes32 k=key(account,market,token);
        if(nonce!=lastNonce[k]+1)revert DuplicateCheckpoint();
        (int256 amount,bool ready)=IFundingCheckpointSource(engine).fundingCheckpoint(account,market,token,nonce);if(!ready||amount==type(int256).min)revert InvalidCheckpoint();
        lastNonce[k]=nonce;uint256 ep=currentEpoch();
        if(amount>0){
            uint256 n=uint256(amount);Epoch storage x=epochs[token][ep];if(x.isSealed)revert InvalidEpoch();
            id=claimForEpoch[k][ep];if(id==0){id=++claimCount;claimForEpoch[k][ep]=id;claims[id]=Claim(account,market,token,ep,0,0,0);if(x.ids.length==0)queues[token].push(ep);x.ids.push(id);}
            Claim storage c=claims[id];c.face+=n;c.remaining+=n;x.face+=n;x.unfunded+=n;receivable[k]+=n;totalReceivable[token]+=n;
        }else if(amount<0){uint256 n=uint256(-amount);payableAmount[k]+=n;totalPayable[token]+=n;accountPayable[account][token]+=n;}
        emit FundingBooked(account,market,token,nonce,amount,ep,id);
    }
    function _cash(address token,address account) private view returns(Cash memory c){
        IFundingVaultView v=IFundingVaultView(vault);c.pool=v.fundingPoolBalance(token);c.user=v.availableBalance(account,token)+v.lockedBalance(account,token);c.accounted=v.totalAccounted(token);c.insurance=v.insuranceFeeReserve(token);c.treasury=v.treasuryFeeReserve(token);c.custody=IFundingTokenView(token).balanceOf(vault);
        if(c.custody<c.pool+c.accounted+c.insurance+c.treasury||reservedCash[token]>c.pool)revert Underfunded();
    }
    function collect(address account,uint256 market,address token,uint256 amount) external onlyEngine guard {
        bytes32 k=key(account,market,token);if(amount==0||amount>payableAmount[k])revert InvalidInput();Cash memory b=_cash(token,account);if(amount>b.user||amount>b.accounted)revert Underfunded();
        payableAmount[k]-=amount;totalPayable[token]-=amount;accountPayable[account][token]-=amount;IFundingCashAdapter(adapter).collect(account,market,token,amount);Cash memory a=_cash(token,account);
        if(a.pool!=b.pool+amount||a.user!=b.user-amount||a.accounted!=b.accounted-amount||a.insurance!=b.insurance||a.treasury!=b.treasury||a.custody!=b.custody)revert CashMismatch();
        emit FundingCollected(account,market,token,amount,payableAmount[k]);
    }
    function seal(address token,uint256 ep) external guard {Epoch storage x=epochs[token][ep];if(ep>=currentEpoch()||x.isSealed||x.ids.length==0)revert InvalidEpoch();x.isSealed=true;emit EpochSealed(token,ep,x.face,x.ids.length);}
    function startRound(address token,uint256 ep) external guard {
        Epoch storage x=epochs[token][ep];if(head[token]>=queues[token].length||queues[token][head[token]]!=ep||!x.isSealed||x.active||x.unfunded==0)revert InvalidRound();
        Cash memory c=_cash(token,address(0));uint256 free=c.pool-reservedCash[token];uint256 budget=free<x.unfunded?free:x.unfunded;
        if(budget==0||(x.lastZeroDenominator==x.unfunded&&budget<=x.lastZeroBudget))revert Underfunded();
        x.active=true;x.budget=budget;x.denominator=x.unfunded;x.cursor=0;x.allocated=0;x.round++;reservedCash[token]+=budget;
        emit RoundStarted(token,ep,x.round,budget,x.denominator);
    }
    function allocate(address token,uint256 ep,uint256 maxItems) external guard {
        if(maxItems==0||maxItems>MAX_BATCH)revert BatchLimit();Epoch storage x=epochs[token][ep];if(!x.active)revert InvalidRound();
        // A prior reservation is not sufficient evidence if an external custody path changed cash.
        _cash(token,address(0));
        uint256 end=x.cursor+maxItems;if(end>x.ids.length)end=x.ids.length;
        for(uint256 i=x.cursor;i<end;i++){
            uint256 id=x.ids[i];Claim storage c=claims[id];uint256 n=LedgerMath.proportion(x.budget,c.remaining-c.reserved,x.denominator);
            if(n!=0){c.reserved+=n;x.unfunded-=n;x.allocated+=n;emit ClaimAllocated(id,x.round,n);}
        }
        x.cursor=end;
        if(end==x.ids.length){uint256 dust=x.budget-x.allocated;reservedCash[token]-=dust;x.active=false;if(x.allocated==0){x.lastZeroBudget=x.budget;x.lastZeroDenominator=x.denominator;}emit RoundFinished(token,ep,x.round,x.allocated,dust);}
    }
    function claim(uint256 id,uint256 amount) external guard {
        Claim storage c=claims[id];if(amount==0||amount>c.reserved)revert InvalidInput();Cash memory b=_cash(c.token,c.account);if(amount>b.pool)revert Underfunded();
        c.reserved-=amount;c.remaining-=amount;reservedCash[c.token]-=amount;receivable[key(c.account,c.market,c.token)]-=amount;totalReceivable[c.token]-=amount;
        IFundingCashAdapter(adapter).pay(c.account,c.token,amount);Cash memory a=_cash(c.token,c.account);
        if(a.pool!=b.pool-amount||a.user!=b.user+amount||a.accounted!=b.accounted+amount||a.insurance!=b.insurance||a.treasury!=b.treasury||a.custody!=b.custody)revert CashMismatch();emit ClaimPaid(id,c.account,amount,c.remaining);
    }
    function advance(address token,uint256 maxItems) external guard {
        if(maxItems==0||maxItems>MAX_BATCH)revert BatchLimit();uint256 n;
        while(head[token]<queues[token].length&&n<maxItems){Epoch storage x=epochs[token][queues[token][head[token]]];if(x.active||x.unfunded!=0)break;head[token]++;n++;}emit HeadAdvanced(token,head[token]);
    }
    function epochState(address token,uint256 ep) external view returns(uint256 face,uint256 unfunded,bool isSealed,bool active,uint256 budget,uint256 denominator,uint256 cursor,uint256 allocated,uint256 round,uint256 count){Epoch storage x=epochs[token][ep];return(x.face,x.unfunded,x.isSealed,x.active,x.budget,x.denominator,x.cursor,x.allocated,x.round,x.ids.length);}
    function epochClaim(address token,uint256 ep,uint256 index) external view returns(uint256){return epochs[token][ep].ids[index];}
    function queuedEpoch(address token,uint256 index) external view returns(uint256){return queues[token][index];}
    function queueLength(address token) external view returns(uint256){return queues[token].length;}
    function freeCash(address token) external view returns(uint256){Cash memory c=_cash(token,address(0));return c.pool-reservedCash[token];}
}
