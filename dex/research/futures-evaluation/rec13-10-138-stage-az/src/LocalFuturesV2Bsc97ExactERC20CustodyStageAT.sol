// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ILQCCollateralCustodyPortStageAR} from
    "./LocalFuturesV2Bsc97PortsStageAR.sol";

interface IERC20ExactStageAT {
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount)
        external returns (bool);
}

/**
 * @notice BSC97 isolated prototype of real ERC20 balance-delta custody.
 * @dev UNREVIEWED RESEARCH ONLY: does move supplied test ERC20 balances, but
 *      there is no certified position registry, real venue/clearing authority,
 *      risk or Pyth proof. Never supply a valuable real token or deploy this
 *      as an operating vault. Only 18-decimal, non-rebasing, exact-transfer
 *      ERC20 tokens with stable non-proxy code are supported. Profits must be
 *      funded BEFORE settlement; no unbacked payout is possible by design.
 *      A nominated local controller is trusted to register and settle positions.
 */
contract LocalFuturesV2Bsc97ExactERC20CustodyStageAT is
    ILQCCollateralCustodyPortStageAR
{
    error WrongChain();
    error InvalidConfiguration();
    error Forbidden();
    error Invalid();
    error TokenCodeChanged();
    error AlreadyRegistered();
    error AlreadyDeposited();
    error NoDeposit();
    error AlreadySettled();
    error UnfundedPayout();
    error TransferFailed();
    error BalanceMismatch();
    error Reentrant();

    IERC20ExactStageAT public immutable collateralToken;
    bytes32 public immutable approvedTokenCodehash;
    address public immutable controller;

    uint256 public totalLockedPrincipal18;
    uint256 public availableProfitReserve18;
    mapping(bytes32 => address) public registeredOwner;
    mapping(bytes32 => CustodyReceipt) private receipts;
    bool private entered;

    event PositionRegistered(bytes32 indexed positionKey, address indexed owner);
    event CollateralLocked(
        bytes32 indexed positionKey, address indexed owner, uint256 exactPrincipal18
    );
    event ProfitReserveFunded(address indexed source, uint256 exactAmount18);
    event CollateralSettled(
        bytes32 indexed positionKey, address indexed owner,
        uint256 exactPayout18, bytes32 evidence
    );

    modifier nonReentrant() {
        if (entered) revert Reentrant();
        entered = true;
        _;
        entered = false;
    }

    constructor(address token_, bytes32 codehash_, address controller_) {
        if (block.chainid != 97) revert WrongChain();
        if (token_ == address(0) || token_.code.length == 0 ||
            codehash_ == bytes32(0) || token_.codehash != codehash_ ||
            controller_ == address(0)) revert InvalidConfiguration();
        // This exact unit adapter intentionally excludes 6/8-decimal ERC20s.
        try IERC20ExactStageAT(token_).decimals() returns (uint8 decimals_) {
            if (decimals_ != 18) revert InvalidConfiguration();
        } catch { revert InvalidConfiguration(); }
        collateralToken = IERC20ExactStageAT(token_);
        approvedTokenCodehash = codehash_;
        controller = controller_;
    }

    /** @dev Controller must independently verify that this is a real position.
     *       This prototype does NOT perform that verification itself. */
    function registerPosition(bytes32 positionKey, address owner) external {
        if (msg.sender != controller) revert Forbidden();
        _checkToken();
        if (positionKey == bytes32(0) || owner == address(0)) revert Invalid();
        if (registeredOwner[positionKey] != address(0)) revert AlreadyRegistered();
        registeredOwner[positionKey] = owner;
        emit PositionRegistered(positionKey, owner);
    }

    /** @notice Pull exactly the advertised collateral from the approved owner. */
    function depositOwn(bytes32 positionKey, uint256 principal18)
        external nonReentrant
    {
        _checkToken();
        if (positionKey == bytes32(0) || principal18 == 0) revert Invalid();
        if (registeredOwner[positionKey] != msg.sender) revert Forbidden();
        if (receipts[positionKey].principalLocked18 != 0) revert AlreadyDeposited();
        uint256 heldBefore = _requireCoverage();
        uint256 ownerBefore = collateralToken.balanceOf(msg.sender);
        _safeTokenCall(abi.encodeCall(
            IERC20ExactStageAT.transferFrom,
            (msg.sender, address(this), principal18)
        ));
        uint256 heldAfter = collateralToken.balanceOf(address(this));
        uint256 ownerAfter = collateralToken.balanceOf(msg.sender);
        if (heldAfter < heldBefore || heldAfter - heldBefore != principal18 ||
            ownerAfter > ownerBefore || ownerBefore - ownerAfter != principal18)
            revert BalanceMismatch();

        totalLockedPrincipal18 += principal18;
        receipts[positionKey] = CustodyReceipt({
            positionKey: positionKey, account: msg.sender,
            collateralToken: address(collateralToken),
            principalLocked18: principal18, payout18: 0,
            custodyEvidence: bytes32(0), recordedAt: 0, finalized: false
        });
        emit CollateralLocked(positionKey, msg.sender, principal18);
    }

    /** @notice Explicitly fund the reserve, with exact transfer checks. */
    function fundProfitReserve(uint256 amount18) external nonReentrant {
        _checkToken();
        if (amount18 == 0) revert Invalid();
        uint256 heldBefore = _requireCoverage();
        uint256 payerBefore = collateralToken.balanceOf(msg.sender);
        _safeTokenCall(abi.encodeCall(
            IERC20ExactStageAT.transferFrom,
            (msg.sender, address(this), amount18)
        ));
        uint256 heldAfter = collateralToken.balanceOf(address(this));
        uint256 payerAfter = collateralToken.balanceOf(msg.sender);
        if (heldAfter < heldBefore || heldAfter - heldBefore != amount18 ||
            payerAfter > payerBefore || payerBefore - payerAfter != amount18)
            revert BalanceMismatch();
        availableProfitReserve18 += amount18;
        emit ProfitReserveFunded(msg.sender, amount18);
    }

    /**
     * @notice Controller-only settlement and exact owner receipt confirmation.
     * @dev Does not authorize a real trade or prove authenticity of `evidence`;
     *      a malicious controller can lie and must not be used in production.
     */
    function settle(bytes32 positionKey, uint256 payout18, bytes32 evidence)
        external nonReentrant
    {
        if (msg.sender != controller) revert Forbidden();
        _checkToken();
        if (positionKey == bytes32(0) || evidence == bytes32(0)) revert Invalid();
        CustodyReceipt storage receipt = receipts[positionKey];
        uint256 principal18 = receipt.principalLocked18;
        if (principal18 == 0) revert NoDeposit();
        if (receipt.finalized) revert AlreadySettled();
        uint256 oldReserve = availableProfitReserve18;
        if (payout18 > principal18 + oldReserve) revert UnfundedPayout();
        uint256 heldBefore = _requireCoverage();
        address owner = receipt.account;
        uint256 ownerBefore = collateralToken.balanceOf(owner);

        // Checked effects before interaction; a revert undoes the entire TX.
        totalLockedPrincipal18 -= principal18;
        availableProfitReserve18 = oldReserve + principal18 - payout18;
        receipt.payout18 = payout18;
        receipt.custodyEvidence = evidence;
        if (block.timestamp > type(uint64).max) revert Invalid();
        receipt.recordedAt = uint64(block.timestamp);
        receipt.finalized = true;

        if (payout18 != 0) {
            _safeTokenCall(abi.encodeCall(
                IERC20ExactStageAT.transfer, (owner, payout18)
            ));
        }
        uint256 heldAfter = collateralToken.balanceOf(address(this));
        uint256 ownerAfter = collateralToken.balanceOf(owner);
        if (heldAfter > heldBefore || heldBefore - heldAfter != payout18 ||
            ownerAfter < ownerBefore || ownerAfter - ownerBefore != payout18 ||
            heldAfter < totalLockedPrincipal18 + availableProfitReserve18)
            revert BalanceMismatch();
        emit CollateralSettled(positionKey, owner, payout18, evidence);
    }

    /** @notice Stage AR sees only fully paid, finalized custody receipts. */
    function custodyOf(bytes32 positionKey)
        external view returns (CustodyReceipt memory)
    {
        _checkToken();
        _requireCoverage();
        return receipts[positionKey];
    }

    function coverage() external view returns (
        uint256 held18, uint256 expected18, bool covered
    ) {
        _checkToken();
        held18 = collateralToken.balanceOf(address(this));
        expected18 = totalLockedPrincipal18 + availableProfitReserve18;
        covered = held18 >= expected18;
    }

    function _checkToken() private view {
        if (address(collateralToken).codehash != approvedTokenCodehash)
            revert TokenCodeChanged();
    }

    function _requireCoverage() private view returns (uint256 held18) {
        held18 = collateralToken.balanceOf(address(this));
        if (held18 < totalLockedPrincipal18 + availableProfitReserve18)
            revert BalanceMismatch();
    }

    /** @dev Compatible with a boolean ERC20 or a no-return ERC20. */
    function _safeTokenCall(bytes memory data) private {
        (bool ok, bytes memory response) = address(collateralToken).call(data);
        if (!ok || (response.length != 0 &&
            (response.length != 32 || !abi.decode(response, (bool)))))
            revert TransferFailed();
    }
}
