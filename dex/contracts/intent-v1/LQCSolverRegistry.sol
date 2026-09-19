// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20SolverBond {
    function transferFrom(address from,address to,uint256 amount) external returns(bool);
    function transfer(address to,uint256 amount) external returns(bool);
}

contract LQCSolverRegistry {
    struct Solver { uint256 bond; uint256 exposure; bool active; }
    mapping(address=>Solver) public solvers;
    IERC20SolverBond public immutable bondToken;
    address public owner;
    address public guardian;
    address public exposureManager;
    uint256 public minimumBond;
    uint256 public exposureLimit;
    bool public paused;
    uint256 private _locked=1;

    error Unauthorized(); error InvalidAddress(); error InvalidAmount(); error Paused();
    error InsufficientBond(); error ExposureLimitExceeded(); error ActiveExposure(); error TransferFailed(); error Reentrancy();

    event SolverBonded(address indexed solver,uint256 amount,uint256 totalBond);
    event SolverWithdrawn(address indexed solver,uint256 amount,uint256 remainingBond);
    event ExposureUpdated(address indexed solver,uint256 exposure);
    event SolverStatus(address indexed solver,bool active);

    modifier onlyOwner(){if(msg.sender!=owner)revert Unauthorized();_;}
    modifier onlyGuardianOrOwner(){if(msg.sender!=guardian&&msg.sender!=owner)revert Unauthorized();_;}
    modifier onlyExposureManager(){if(msg.sender!=exposureManager)revert Unauthorized();_;}
    modifier nonReentrant(){if(_locked!=1)revert Reentrancy();_locked=2;_;_locked=1;}

    constructor(address token,address owner_,address guardian_,uint256 minimumBond_,uint256 exposureLimit_){
        if(token==address(0)||owner_==address(0)||guardian_==address(0))revert InvalidAddress();
        if(minimumBond_==0||exposureLimit_==0)revert InvalidAmount();
        bondToken=IERC20SolverBond(token);owner=owner_;guardian=guardian_;minimumBond=minimumBond_;exposureLimit=exposureLimit_;
    }

    function setExposureManager(address next) external onlyOwner {if(next==address(0))revert InvalidAddress();exposureManager=next;}
    function setPaused(bool value) external onlyGuardianOrOwner {paused=value;}
    function setLimits(uint256 minimumBond_,uint256 exposureLimit_) external onlyOwner {if(minimumBond_==0||exposureLimit_==0)revert InvalidAmount();minimumBond=minimumBond_;exposureLimit=exposureLimit_;}

    function bond(uint256 amount) external nonReentrant {
        if(paused)revert Paused();if(amount==0)revert InvalidAmount();
        Solver storage s=solvers[msg.sender];s.bond+=amount;
        if(!bondToken.transferFrom(msg.sender,address(this),amount))revert TransferFailed();
        s.active=s.bond>=minimumBond;emit SolverBonded(msg.sender,amount,s.bond);emit SolverStatus(msg.sender,s.active);
    }

    function withdrawBond(uint256 amount) external nonReentrant {
        Solver storage s=solvers[msg.sender];if(amount==0||amount>s.bond)revert InvalidAmount();if(s.exposure!=0)revert ActiveExposure();
        uint256 remaining=s.bond-amount;s.bond=remaining;s.active=remaining>=minimumBond;
        if(!bondToken.transfer(msg.sender,amount))revert TransferFailed();
        emit SolverWithdrawn(msg.sender,amount,remaining);emit SolverStatus(msg.sender,s.active);
    }

    function increaseExposure(address solver,uint256 amount) external onlyExposureManager {
        if(paused)revert Paused();Solver storage s=solvers[solver];if(!s.active||s.bond<minimumBond)revert InsufficientBond();
        uint256 next=s.exposure+amount;if(next>exposureLimit||next>s.bond)revert ExposureLimitExceeded();s.exposure=next;emit ExposureUpdated(solver,next);
    }
    function decreaseExposure(address solver,uint256 amount) external onlyExposureManager {
        Solver storage s=solvers[solver];if(amount>s.exposure)revert InvalidAmount();s.exposure-=amount;emit ExposureUpdated(solver,s.exposure);
    }
}
