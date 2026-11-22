// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {LQCFuturesM26TwoSidedFxPreview as TwoSided} from "../dex/contracts/futures/LQCFuturesM26TwoSidedFxPreview.sol";
import {LQCFuturesM27SurplusProvenanceReview as Provenance} from "../dex/contracts/futures/LQCFuturesM27SurplusProvenanceReview.sol";
import {LQCFuturesM25FxSettlementPreview as LossFx} from "../dex/contracts/futures/LQCFuturesM25FxSettlementPreview.sol";
import {LQCFuturesM24CollateralRiskPreview as Risk} from "../dex/contracts/futures/LQCFuturesM24CollateralRiskPreview.sol";
import {LQCFuturesVault as Vault} from "../dex/contracts/futures/LQCFuturesVault.sol";
import {MockPriceFeed as Feed} from "../dex/contracts/mocks/MockPriceFeed.sol";
import {M20MockCollateral6 as Token6} from "./mocks/M20MockCollateral6.sol";
import {MockERC20 as Token18} from "../dex/contracts/mocks/MockERC20.sol";

interface M26Vm {
    function warp(uint256 timestamp) external;
    function prank(address account) external;
    function expectRevert(bytes4 selector) external;
}
contract LQCFuturesM27SurplusProvenanceTest {
    M26Vm private constant vm=M26Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant START=2_000_000_000;
    address private constant USER=address(0xB22);
    Feed private primary;
    Feed private secondary;
    Risk private risk;
    LossFx private loss;
    TwoSided private fx;
    Vault private vault;
    Token6 private token;
    Token18 private token18;
    Provenance private provenance;
    bytes32 private constant EVIDENCE = keccak256("synthetic-test-review-not-legal-title");

    function setUp() public {
        vm.warp(START);
        primary=new Feed(8,80_000_000);
        secondary=new Feed(8,82_000_000);
        risk=new Risk(address(primary),address(secondary),500);
        loss=new LossFx(address(risk));
        vault=new Vault(address(this));
        token=new Token6();
        token18=new Token18("M26 synthetic USD18","tUSD18");
        vault.setSupportedCollateral(address(token),true);
        vault.setSupportedCollateral(address(token18),true);
        vault.setEngine(address(this));
        fx=new TwoSided(address(risk),address(loss),address(vault));
        provenance=new Provenance(address(fx),address(this));

        token.mint(USER,1_000e6);
        vm.prank(USER);
        token.approve(address(vault),1_000e6);
        vm.prank(USER);
        vault.deposit(address(token),1_000e6);
        token.mint(address(vault),200e6); // explicit synthetic unreserved surplus

        token18.mint(USER,1_000e18);
        vm.prank(USER);
        token18.approve(address(vault),1_000e18);
        vm.prank(USER);
        vault.deposit(address(token18),1_000e18);
        token18.mint(address(vault),200e18);
    }

    function _setPrices(uint256 centsLow,uint256 centsHigh) private {
        primary.setAnswer(int256(centsLow*1e6));
        secondary.setAnswer(int256(centsHigh*1e6));
    }

    function test_M26_LossAtLowerQuoteButProfitAtHigherQuote() public {
        (uint256 low,uint256 high)=fx.collateralQuoteBounds();
        require(low==80e16&&high==82e16,"M26 quote bounds wrong");
        require(fx.previewLossTokens(100e18,6)==125e6,"M26 loss not computed with lower quote");
        uint256 profit=fx.previewProfitTokens(100e18,6);
        require(profit==121_951_219,"M26 profit not computed with higher quote");
        require(profit<fx.previewLossTokens(100e18,6),"M26 payout not bounded by adverse quote");
    }

    function test_M26_VaultActualSurplusLimitsProfitPayout() public {
        (uint256 paid,uint256 beforeExcess,uint256 afterExcess)=
            fx.previewBoundedProfit(address(token),100e18,6);
        require(paid==121_951_219&&beforeExcess==200e6&&afterExcess==78_048_781,
            "M26 real Vault surplus not reconciled");
        require(vault.availableBalance(USER,address(token))==1_000e6,
            "M26 read-only preview changed user rights");
        require(token.balanceOf(address(vault))==1_200e6,"M26 preview transferred assets");
    }

    function test_M26_RejectProfitGreaterThanVaultSurplus() public {
        vm.expectRevert(TwoSided.InsufficientUnreservedLiquidity.selector);
        fx.previewBoundedProfit(address(token),200e18,6);
        require(vault.availableBalance(USER,address(token))==1_000e6,
            "M26 failed payout changed liabilities");
    }

    function test_M26_ReserveSeparationRemainsExplicit() public {
        vault.collectTradingFee(USER,address(token),100e6,60e6);
        vault.settleFunding(USER,address(token),-int256(10e6));
        require(vault.totalAccounted(address(token))==890e6,"M26 accounted unexpected");
        require(vault.insuranceFeeReserve(address(token))==60e6,"M26 Insurance reserve wrong");
        require(vault.treasuryFeeReserve(address(token))==40e6,"M26 Treasury reserve wrong");
        require(vault.fundingPoolBalance(address(token))==10e6,"M26 funding reserve wrong");
        // 1200 assets - (890 user + 60 insurance +40 treasury +10 funding) = 200.
        require(fx.unreservedVaultSurplus(address(token))==200e6,
            "M26 protocol reserves exposed as payout excess");
        require(fx.previewProfitTokens(100e18,6)<fx.unreservedVaultSurplus(address(token)),
            "M26 profit outside explicit excess");
    }

    function test_M26_SixVsEighteenDecimalsUseSameEconomicQuote() public {
        uint256 loss6=fx.previewLossTokens(100e18,6);
        uint256 loss18=fx.previewLossTokens(100e18,18);
        uint256 profit6=fx.previewProfitTokens(100e18,6);
        uint256 profit18=fx.previewProfitTokens(100e18,18);
        require(loss18/1e12==loss6,"M26 loss decimal equivalence");
        require(profit18/1e12==profit6,"M26 profit decimal equivalence");
        (uint256 paid18,uint256 surplus18,)=fx.previewBoundedProfit(address(token18),100e18,18);
        require(paid18==profit18&&surplus18==200e18,"M26 actual 18-decimal surplus mismatch");
    }

    function test_M26_StaleOrInconsistentFeedDeniesBothSides() public {
        secondary.setUpdatedAt(START-121);
        vm.expectRevert(Risk.InvalidCollateralQuote.selector);
        fx.previewProfitTokens(100e18,6);
        secondary.setUpdatedAt(START);
        secondary.setAnswer(100_000_000);
        vm.expectRevert(Risk.InvalidCollateralQuote.selector);
        fx.previewLossTokens(100e18,6);
    }

    function test_M26_UnsupportedDecimalsFailClosed() public {
        vm.expectRevert(TwoSided.UnsupportedDecimals.selector);
        fx.previewProfitTokens(100e18,8);
    }

    function testFuzz_M26_HigherUpperPriceCannotIncreaseProfitTokenPayout(uint16 seedUsd,uint8 seedHigher) public {
        uint256 amount=(uint256(seedUsd)%500+1)*1e18;
        uint256 price=80+uint256(seedHigher)%4; // preserve <= 5% divergence
        _setPrices(80,80);
        uint256 at80=fx.previewProfitTokens(amount,6);
        _setPrices(80,price);
        uint256 atHigher=fx.previewProfitTokens(amount,6);
        require(atHigher<=at80,"M26 higher collateral price raised profit payout");
    }

    function testFuzz_M26_ProfitPreviewNeverOverstatesPhysicalSurplus(uint16 seedUsd) public {
        uint256 amount=uint256(seedUsd)%200+1;
        uint256 paid=fx.previewProfitTokens(amount*1e18,6);
        uint256 surplus=fx.unreservedVaultSurplus(address(token));
        if(paid<=surplus) {
            (uint256 actual,,uint256 afterExcess)=fx.previewBoundedProfit(address(token),amount*1e18,6);
            require(actual==paid&&afterExcess+paid==surplus,"M26 payout conservation");
        } else {
            vm.expectRevert(TwoSided.InsufficientUnreservedLiquidity.selector);
            fx.previewBoundedProfit(address(token),amount*1e18,6);
        }
    }

    function test_M26_RejectMismatchedTokenDecimalsInPayoutPreview() public {
        vm.expectRevert(TwoSided.UnsupportedDecimals.selector);
        fx.previewBoundedProfit(address(token),100e18,18);
        vm.expectRevert(TwoSided.UnsupportedDecimals.selector);
        fx.previewBoundedProfit(address(token18),100e18,6);
    }

    function test_M26_ResidualBadDebtBlocksPayoutEvenWithPhysicalExcess() public {
        (uint256 initialPaid,,)=fx.previewBoundedProfit(address(token),100e18,6);
        require(initialPaid>0,"M26 initial payout precondition failed");
        // Vault authorizes this isolated test as mock Engine only; never production.
        vault.coverBadDebt(address(token),10e6,0);
        require(vault.residualBadDebt(address(token))==10e6,
            "M26 bad debt not recorded");
        require(fx.unreservedVaultSurplus(address(token))==200e6,
            "M26 bad debt should not fabricate new physical assets");
        vm.expectRevert(TwoSided.CollateralHasResidualDebt.selector);
        fx.previewBoundedProfit(address(token),100e18,6);
        require(vault.availableBalance(USER,address(token))==1_000e6,
            "M26 bad debt payout attempted to debit user");
    }

    function test_M27_DonatedTokensAreNotAutomaticallySpendable() public {
        // The M26 surplus is 200 from direct token mint, with no proven owner.
        require(fx.unreservedVaultSurplus(address(token))==200e6,
            "M27 synthetic donation amount not present");
        require(provenance.remainingReviewedBudget(address(token))==0,
            "M27 unreviewed gift erroneously became an entitlement");
        vm.expectRevert(Provenance.UnreviewedSurplus.selector);
        provenance.reserveQuote(keccak256("claim-a"),address(token),USER,100e18,6,EVIDENCE);
    }

    function test_M27_ApprovedReviewBudgetStillDoesNotAuthorizeTransfer() public {
        provenance.reviewBudget(address(token),EVIDENCE,200e6,0);
        bytes32 id=keccak256("claim-a");
        uint256 units=provenance.reserveQuote(id,address(token),USER,100e18,6,EVIDENCE);
        require(units==121_951_219,"M27 reviewed candidate FX amount wrong");
        require(provenance.remainingReviewedBudget(address(token))==78_048_781,
            "M27 budget not reserved");
        require(vault.availableBalance(USER,address(token))==1_000e6,
            "M27 quote altered real user rights");
        require(token.balanceOf(address(vault))==1_200e6,
            "M27 quote transferred Vault assets");
        vm.expectRevert(Provenance.DuplicateClaim.selector);
        provenance.reserveQuote(id,address(token),USER,10e18,6,EVIDENCE);
    }

    function test_M27_SecondQuoteCannotOverbookSamePhysicalSurplus() public {
        provenance.reviewBudget(address(token),EVIDENCE,200e6,0);
        provenance.reserveQuote(keccak256("claim-a"),address(token),USER,100e18,6,EVIDENCE);
        vm.expectRevert(Provenance.InsufficientReviewBudget.selector);
        provenance.reserveQuote(keccak256("claim-b"),address(token),address(0xC33),100e18,6,EVIDENCE);
        require(provenance.remainingReviewedBudget(address(token))==78_048_781,
            "M27 failed second request consumed budget");
    }

    function test_M27_UnreviewedEncumbrancesMustReduceAvailableBudget() public {
        provenance.reviewBudget(address(token),EVIDENCE,200e6,100e6);
        require(provenance.remainingReviewedBudget(address(token))==100e6,
            "M27 other claims not reserved");
        vm.expectRevert(Provenance.InsufficientReviewBudget.selector);
        provenance.reserveQuote(keccak256("claim-a"),address(token),USER,100e18,6,EVIDENCE);
    }

    function test_M27_NoBudgetCanExceedPhysicalExcess() public {
        vm.expectRevert(Provenance.OvercommittedPhysicalSurplus.selector);
        provenance.reviewBudget(address(token),EVIDENCE,201e6,0);
        vm.expectRevert(Provenance.InvalidEvidence.selector);
        provenance.reviewBudget(address(token),bytes32(0),200e6,0);
    }

    function test_M27_EvidenceCannotChangeWhileQuotesReserved() public {
        provenance.reviewBudget(address(token),EVIDENCE,200e6,0);
        provenance.reserveQuote(keccak256("claim-a"),address(token),USER,100e18,6,EVIDENCE);
        vm.expectRevert(Provenance.OutstandingClaims.selector);
        provenance.reviewBudget(address(token),keccak256("different-snapshot"),200e6,0);
        vm.expectRevert(Provenance.UnreviewedSurplus.selector);
        provenance.reserveQuote(keccak256("claim-b"),address(token),USER,10e18,6,
            keccak256("different-snapshot"));
    }

    function test_M27_CancelFreesBudgetButDoesNotResetClaimReplayID() public {
        provenance.reviewBudget(address(token),EVIDENCE,200e6,0);
        bytes32 id=keccak256("claim-a");
        provenance.reserveQuote(id,address(token),USER,100e18,6,EVIDENCE);
        provenance.cancelQuote(id);
        require(provenance.remainingReviewedBudget(address(token))==200e6,
            "M27 canceled quote did not restore budget");
        vm.expectRevert(Provenance.DuplicateClaim.selector);
        provenance.reserveQuote(id,address(token),USER,100e18,6,EVIDENCE);
        provenance.reserveQuote(keccak256("claim-new"),address(token),USER,100e18,6,EVIDENCE);
    }

    function test_M27_ResidualBadDebtBlocksNewReviewAndReservation() public {
        provenance.reviewBudget(address(token),EVIDENCE,200e6,0);
        vault.coverBadDebt(address(token),10e6,0);
        vm.expectRevert(Provenance.UnresolvedBadDebt.selector);
        provenance.reserveQuote(keccak256("claim-a"),address(token),USER,100e18,6,EVIDENCE);
        vm.expectRevert(Provenance.UnresolvedBadDebt.selector);
        provenance.reviewBudget(address(token),EVIDENCE,200e6,0);
    }

    function test_M27_NonReviewerCannotApproveOrReserve() public {
        vm.expectRevert(Provenance.NotReviewer.selector);
        vm.prank(USER);
        provenance.reviewBudget(address(token),EVIDENCE,200e6,0);
        provenance.reviewBudget(address(token),EVIDENCE,200e6,0);
        vm.expectRevert(Provenance.NotReviewer.selector);
        vm.prank(USER);
        provenance.reserveQuote(keccak256("claim-a"),address(token),USER,100e18,6,EVIDENCE);
    }

    function testFuzz_M27_ReviewedPayoutNeverExceedsBudget(uint16 usdSeed) public {
        uint256 amount=uint256(usdSeed)%250+1;
        provenance.reviewBudget(address(token),EVIDENCE,200e6,0);
        uint256 candidate=fx.previewProfitTokens(amount*1e18,6);
        bytes32 id=keccak256(abi.encodePacked("M27-fuzz",amount));
        if(candidate<=200e6) {
            provenance.reserveQuote(id,address(token),USER,amount*1e18,6,EVIDENCE);
            require(provenance.remainingReviewedBudget(address(token))+candidate==200e6,
                "M27 reviewed balance not conserved");
        } else {
            // M26 independently rejects requests beyond physical surplus first.
            vm.expectRevert(TwoSided.InsufficientUnreservedLiquidity.selector);
            provenance.reserveQuote(id,address(token),USER,amount*1e18,6,EVIDENCE);
        }
    }
}
