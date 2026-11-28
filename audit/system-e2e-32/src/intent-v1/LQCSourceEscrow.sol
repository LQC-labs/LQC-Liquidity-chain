// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "./LQCCoreIntentState.sol";

interface IERC20Escrow {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from,address to,uint256 amount) external returns(bool);
    function transfer(address to,uint256 amount) external returns(bool);
}

contract LQCSourceEscrow is LQCCoreIntentState {
    struct Escrow { address token; uint256 amount; }
    mapping(bytes32=>Escrow) public escrows;
    address public immutable intentHub;
    uint256 private _locked=1;

    error UnauthorizedHub(); error InvalidToken(); error InvalidAmount(); error TransferFailed(); error Reentrancy(); error InvalidExecutionTarget();

    modifier nonReentrant(){if(_locked!=1)revert Reentrancy();_locked=2;_;_locked=1;}
    modifier onlyHub(){if(msg.sender!=intentHub)revert UnauthorizedHub();_;}

    constructor(address hub){if(hub==address(0))revert InvalidSender();intentHub=hub;}

    function lock(bytes32 intentHash,address token,uint256 amount,uint256 nonce,uint256 deadline) external virtual nonReentrant {
        if(token==address(0))revert InvalidToken();if(amount==0)revert InvalidAmount();
        _registerIntent(intentHash,msg.sender,nonce,deadline);
        escrows[intentHash]=Escrow(token,amount);
        IERC20Escrow asset = IERC20Escrow(token);
        uint256 beforeBalance = asset.balanceOf(address(this));
        if (!asset.transferFrom(msg.sender, address(this), amount) ||
            asset.balanceOf(address(this)) != beforeBalance + amount) revert TransferFailed();
    }

    function release(bytes32 intentHash,address recipient) external virtual onlyHub nonReentrant {
        if(recipient==address(0))revert InvalidSender();
        _markExecuted(intentHash);Escrow memory e=escrows[intentHash];delete escrows[intentHash];
        if(!IERC20Escrow(e.token).transfer(recipient,e.amount))revert TransferFailed();
    }

    /// @notice Atomically hands escrowed input to an approved execution target and invokes it.
    /// @dev Any target failure reverts the token transfer, lifecycle transition and escrow deletion.
    function executeThrough(bytes32 intentHash,address executionTarget,bytes calldata executionCall) external onlyHub nonReentrant returns(bytes memory result) {
        if(executionTarget==address(0)||executionCall.length<4)revert InvalidExecutionTarget();
        _requirePending(intentHash);Escrow memory e=escrows[intentHash];
        IERC20Escrow token = IERC20Escrow(e.token);
        uint256 escrowBefore = token.balanceOf(address(this));
        uint256 targetBefore = token.balanceOf(executionTarget);
        if (escrowBefore < e.amount || !token.transfer(executionTarget, e.amount) ||
            token.balanceOf(address(this)) != escrowBefore - e.amount ||
            token.balanceOf(executionTarget) != targetBefore + e.amount) revert TransferFailed();
        (bool ok,bytes memory data)=executionTarget.call(executionCall);
        if(!ok){assembly{revert(add(data,32),mload(data))}}
        // Keep the record readable during the authenticated execution so Binding can
        // verify token and amount. The reentrancy lock prevents concurrent consumption.
        delete escrows[intentHash];
        _markExecuted(intentHash);
        return data;
    }

    function cancelAndRefund(bytes32 intentHash) external nonReentrant {
        Escrow memory e=escrows[intentHash];_cancelIntent(intentHash,msg.sender);delete escrows[intentHash];
        _refundExact(e,msg.sender);
    }

    function expireAndRefund(bytes32 intentHash) external nonReentrant {
        IntentRecord memory r=_intents[intentHash];_markExpired(intentHash);Escrow memory e=escrows[intentHash];delete escrows[intentHash];
        _refundExact(e,r.sender);
    }
    function _refundExact(Escrow memory e,address recipient) private {
        IERC20Escrow token = IERC20Escrow(e.token);
        uint256 escrowBefore = token.balanceOf(address(this));
        uint256 recipientBefore = token.balanceOf(recipient);
        if (escrowBefore < e.amount || !token.transfer(recipient,e.amount) ||
            token.balanceOf(address(this)) != escrowBefore - e.amount ||
            token.balanceOf(recipient) != recipientBefore + e.amount) revert TransferFailed();
    }
}
