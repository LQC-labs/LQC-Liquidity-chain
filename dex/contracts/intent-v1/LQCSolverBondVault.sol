// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20BondAsset {function transferFrom(address from,address to,uint256 amount) external returns(bool);function transfer(address to,uint256 amount) external returns(bool);}

contract LQCSolverBondVault {
    struct AssetPolicy { bool enabled; uint16 collateralBps; }
    mapping(address=>AssetPolicy) public policy;
    mapping(address=>mapping(address=>uint256)) public balances;
    mapping(address=>uint256) public weightedBond;
    address public owner; address public guardian; address public lqcToken; address public stablecoin;
    uint256 private unlocked=1; bool public paused;

    error Unauthorized(); error InvalidAddress(); error InvalidPolicy(); error AssetDisabled(); error InvalidAmount(); error TransferFailed(); error Reentrancy(); error Paused();
    event AssetPolicyUpdated(address indexed asset,bool enabled,uint256 collateralBps);
    event BondDeposited(address indexed solver,address indexed asset,uint256 amount,uint256 weightedAmount);
    event BondWithdrawn(address indexed solver,address indexed asset,uint256 amount,uint256 weightedAmount);

    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}
    modifier onlyGuardianOrOwner(){if(msg.sender!=guardian&&msg.sender!=owner)revert Unauthorized();_;}
    modifier nonReentrant(){if(unlocked!=1)revert Reentrancy();unlocked=2;_;unlocked=1;}

    constructor(address owner_,address guardian_,address stablecoin_,address lqcToken_){
        if(owner_==address(0)||guardian_==address(0)||stablecoin_==address(0)||lqcToken_==address(0)||stablecoin_==lqcToken_)revert InvalidAddress();
        owner=owner_;guardian=guardian_;stablecoin=stablecoin_;lqcToken=lqcToken_;
        policy[stablecoin_]=AssetPolicy(true,10000);
        policy[lqcToken_]=AssetPolicy(true,7000);
    }
    function setPaused(bool value) external onlyGuardianOrOwner {paused=value;}
    function setAssetPolicy(address asset,bool enabled,uint16 collateralBps) external onlyOwner {
        if(asset!=stablecoin&&asset!=lqcToken)revert InvalidAddress();
        if(collateralBps==0||collateralBps>10000)revert InvalidPolicy();
        policy[asset]=AssetPolicy(enabled,collateralBps);emit AssetPolicyUpdated(asset,enabled,collateralBps);
    }
    function deposit(address asset,uint256 amount) external nonReentrant {
        if(paused)revert Paused();AssetPolicy memory p=policy[asset];if(!p.enabled)revert AssetDisabled();if(amount==0)revert InvalidAmount();
        uint256 weighted=amount*uint256(p.collateralBps)/10000;
        balances[msg.sender][asset]+=amount;weightedBond[msg.sender]+=weighted;
        if(!IERC20BondAsset(asset).transferFrom(msg.sender,address(this),amount))revert TransferFailed();
        emit BondDeposited(msg.sender,asset,amount,weighted);
    }
    function withdraw(address asset,uint256 amount) external nonReentrant {
        AssetPolicy memory p=policy[asset];uint256 bal=balances[msg.sender][asset];if(amount==0||amount>bal)revert InvalidAmount();
        uint256 weighted=amount*uint256(p.collateralBps)/10000;
        balances[msg.sender][asset]=bal-amount;weightedBond[msg.sender]-=weighted;
        if(!IERC20BondAsset(asset).transfer(msg.sender,amount))revert TransferFailed();
        emit BondWithdrawn(msg.sender,asset,amount,weighted);
    }
}
