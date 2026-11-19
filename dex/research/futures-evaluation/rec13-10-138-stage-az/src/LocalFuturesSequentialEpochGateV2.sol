// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * @title LocalFuturesSequentialEpochGateV2
 * @notice ISOLATED, OFFLINE RESEARCH MODULE. NOT CONNECTED TO THE V1 SYSTEM.
 * @dev The configured peer contracts must independently verify ownership,
 *      oracle evidence, funding, accounting, and release rights. This gate
 *      records only an authorization/sequence state machine; it never holds
 *      or transfers assets and is NOT a replacement for a settlement module.
 */
contract LocalFuturesSequentialEpochGateV2 {
    error Unauthorized();
    error InvalidInput();
    error InvalidEpoch();
    error ActivePosition();
    error InvalidPosition();
    error WrongOwner();
    error WrongState();
    error StaleTime();
    error DuplicateEvidence();
    error DuplicateReceipt();

    enum Status {
        Unseen,
        Open,
        Closed,
        Settled,
        Released
    }

    struct AccountProgress {
        uint32 lastEpoch;
        uint64 lastExitAt;
        uint64 releasedPositions;
        uint256 livePosition;
    }

    struct PositionProgress {
        uint256 domain;
        address owner;
        uint32 epoch;
        uint64 openedAt;
        uint64 closedAt;
        uint64 ordinal;
        Status status;
        bytes32 evidenceCommitment;
        bytes32 settlementReceipt;
    }

    address public immutable tradingCore;
    address public immutable settlementCoordinator;
    address public immutable releaseModule;
    uint32 public immutable maxEpochsPerAccount;
    uint64 public globalOrdinal;

    mapping(bytes32 => AccountProgress) private accountProgress;
    mapping(uint256 => PositionProgress) private positionProgress;
    mapping(bytes32 => bool) public usedEvidence;
    mapping(bytes32 => bool) public usedSettlementReceipt;

    event PositionOpened(uint256 indexed domain, address indexed owner, uint256 indexed pid, uint32 epoch, uint64 ordinal);
    event PositionClosed(uint256 indexed pid, bytes32 evidenceCommitment, uint64 closedAt);
    event PositionSettled(uint256 indexed pid, bytes32 settlementReceipt);
    event PositionReleased(uint256 indexed pid, bytes32 settlementReceipt);

    constructor(address core_, address settlement_, address release_, uint32 maxEpochs_) {
        if (core_ == address(0) || settlement_ == address(0) || release_ == address(0) ||
            core_ == settlement_ || core_ == release_ || settlement_ == release_ || maxEpochs_ == 0) {
            revert InvalidInput();
        }
        tradingCore = core_;
        settlementCoordinator = settlement_;
        releaseModule = release_;
        maxEpochsPerAccount = maxEpochs_;
    }

    function version() external pure returns (uint256) {
        return 2;
    }

    function accountKey(uint256 domain, address owner) public pure returns (bytes32) {
        return keccak256(abi.encode("LOCAL_FUTURES_SEQUENTIAL_EPOCH_V2", domain, owner));
    }

    function account(uint256 domain, address owner) external view returns (AccountProgress memory) {
        return accountProgress[accountKey(domain, owner)];
    }

    function position(uint256 pid) external view returns (PositionProgress memory) {
        return positionProgress[pid];
    }

    function recordOpen(uint256 domain, address owner, uint256 pid, uint32 epoch) external {
        if (msg.sender != tradingCore) revert Unauthorized();
        if (domain == 0 || owner == address(0) || pid == 0) revert InvalidInput();
        if (positionProgress[pid].status != Status.Unseen) revert InvalidPosition();
        AccountProgress storage a = accountProgress[accountKey(domain, owner)];
        if (a.livePosition != 0) revert ActivePosition();
        if (epoch == 0 || epoch > maxEpochsPerAccount || uint256(epoch) != uint256(a.lastEpoch) + 1) {
            revert InvalidEpoch();
        }
        if (a.lastEpoch > 0 && block.timestamp <= a.lastExitAt) revert StaleTime();
        if (block.timestamp > type(uint64).max) revert InvalidInput();

        uint64 ordinal = ++globalOrdinal;
        positionProgress[pid] = PositionProgress({
            domain: domain,
            owner: owner,
            epoch: epoch,
            openedAt: uint64(block.timestamp),
            closedAt: 0,
            ordinal: ordinal,
            status: Status.Open,
            evidenceCommitment: bytes32(0),
            settlementReceipt: bytes32(0)
        });
        a.lastEpoch = epoch;
        a.livePosition = pid;
        emit PositionOpened(domain, owner, pid, epoch, ordinal);
    }

    function recordClose(uint256 domain, address owner, uint256 pid, bytes32 evidenceCommitment) external {
        if (msg.sender != tradingCore) revert Unauthorized();
        PositionProgress storage p = _position(domain, owner, pid);
        if (p.status != Status.Open) revert WrongState();
        if (evidenceCommitment == bytes32(0)) revert InvalidInput();
        if (usedEvidence[evidenceCommitment]) revert DuplicateEvidence();
        if (block.timestamp <= p.openedAt) revert StaleTime();
        if (block.timestamp > type(uint64).max) revert InvalidInput();
        usedEvidence[evidenceCommitment] = true;
        p.status = Status.Closed;
        p.closedAt = uint64(block.timestamp);
        p.evidenceCommitment = evidenceCommitment;
        emit PositionClosed(pid, evidenceCommitment, p.closedAt);
    }

    function recordSettlement(uint256 domain, address owner, uint256 pid, bytes32 receipt) external {
        if (msg.sender != settlementCoordinator) revert Unauthorized();
        PositionProgress storage p = _position(domain, owner, pid);
        if (p.status != Status.Closed) revert WrongState();
        if (receipt == bytes32(0)) revert InvalidInput();
        if (usedSettlementReceipt[receipt]) revert DuplicateReceipt();
        usedSettlementReceipt[receipt] = true;
        p.status = Status.Settled;
        p.settlementReceipt = receipt;
        emit PositionSettled(pid, receipt);
    }

    function recordRelease(uint256 domain, address owner, uint256 pid, bytes32 receipt) external {
        if (msg.sender != releaseModule) revert Unauthorized();
        PositionProgress storage p = _position(domain, owner, pid);
        if (p.status != Status.Settled || p.settlementReceipt != receipt) revert WrongState();
        AccountProgress storage a = accountProgress[accountKey(domain, owner)];
        if (a.livePosition != pid) revert ActivePosition();
        p.status = Status.Released;
        a.livePosition = 0;
        a.lastExitAt = p.closedAt;
        a.releasedPositions += 1;
        emit PositionReleased(pid, receipt);
    }

    function _position(uint256 domain, address owner, uint256 pid)
        private view returns (PositionProgress storage p)
    {
        p = positionProgress[pid];
        if (p.status == Status.Unseen || p.domain != domain) revert InvalidPosition();
        if (p.owner != owner) revert WrongOwner();
    }
}
