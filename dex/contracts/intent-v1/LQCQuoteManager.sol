// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Canonical solver quote intake for Intent execution.
/// @dev Venue-agnostic so the same quote envelope can be reused by spot and futures execution layers.
contract LQCQuoteManager {
    struct Quote {
        bytes32 intentHash;
        address solver;
        uint256 amountOut;
        uint256 gasCostOut;
        uint256 priceImpactBps;
        uint256 expiresAt;
        bytes32 routeHash;
    }

    address public owner;
    address public guardian;
    bool public paused;
    mapping(bytes32=>mapping(address=>bytes32)) public quoteHashes;

    uint256 public constant BPS=10_000;

    error Unauthorized();
    error InvalidAddress();
    error InvalidQuote();
    error QuoteExpired();
    error Paused();

    event QuoteSubmitted(bytes32 indexed intentHash,address indexed solver,bytes32 indexed quoteHash,uint256 amountOut,uint256 expiresAt);
    event PausedUpdated(bool paused);

    constructor(address owner_,address guardian_){
        if(owner_==address(0)||guardian_==address(0))revert InvalidAddress();
        owner=owner_;guardian=guardian_;
    }

    modifier onlyGuardianOrOwner(){if(msg.sender!=guardian&&msg.sender!=owner)revert Unauthorized();_;}

    function setPaused(bool value) external onlyGuardianOrOwner {paused=value;emit PausedUpdated(value);}

    function hashQuote(Quote calldata q) public view returns(bytes32){
        return keccak256(abi.encode(block.chainid,address(this),q.intentHash,q.solver,q.amountOut,q.gasCostOut,q.priceImpactBps,q.expiresAt,q.routeHash));
    }

    function submitQuote(Quote calldata q) external returns(bytes32 quoteHash){
        if(paused)revert Paused();
        if(q.intentHash==bytes32(0)||q.solver==address(0)||msg.sender!=q.solver||q.amountOut==0||q.gasCostOut>=q.amountOut||q.priceImpactBps>BPS||q.routeHash==bytes32(0))revert InvalidQuote();
        if(q.expiresAt<=block.timestamp)revert QuoteExpired();
        quoteHash=hashQuote(q);
        quoteHashes[q.intentHash][q.solver]=quoteHash;
        emit QuoteSubmitted(q.intentHash,q.solver,quoteHash,q.amountOut,q.expiresAt);
    }

    function verifyQuote(Quote calldata q) external view returns(bool){
        if(q.expiresAt<=block.timestamp)return false;
        bytes32 h=hashQuote(q);
        return quoteHashes[q.intentHash][q.solver]==h&&h!=bytes32(0);
    }
}
