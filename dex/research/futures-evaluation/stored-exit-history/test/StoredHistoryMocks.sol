// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {StoredHistory} from "../contracts/StoredExitHistoryVerifier.sol";
// Deliberately mutable adversarial sources. Never presented as authentic history.
contract MockHistoryCore {
 address public localFunding;address public localPartial;address public owner;bytes32 public policy;
 uint256[5] private v;
 function setup(address f,address p,address a,bytes32 pol) external {localFunding=f;localPartial=p;owner=a;policy=pol;v=[uint256(2),1,3,0,0];}
 function links(address f,address p) external {localFunding=f;localPartial=p;}
 function context(address a,uint256[5] calldata values,bytes32 pol) external {owner=a;v=values;policy=pol;}
 function coreExposureContext(uint256) external view returns(address,uint256[5] memory,bytes32){return(owner,v,policy);}
 function exposureBindings(uint256) external view returns(uint256,bytes32,uint256,uint256){return(v[1],policy,v[3],v[4]);}
}
contract MockHistoryFunding {
 address public core;bytes32 public policy;uint256 public sequence=3;
 function setup(address c,bytes32 p) external {core=c;policy=p;}
 function setSequence(uint256 n) external {sequence=n;}
 function coreExposureSequences(bytes32) external view returns(uint256){return sequence;}
 function fundingSeries(uint256,uint256) external view returns(uint256[11] memory v,bytes32 p){v[0]=100;v[1]=100;v[2]=1;return(v,policy);}
}
contract MockHistoryPartial {
 address public core;address public funding;address public attribution;
 StoredHistory.Basis private basis;mapping(uint256=>StoredHistory.Exit) private exits;
 function setup(address c,address f,address a,StoredHistory.Basis calldata b) external {core=c;funding=f;attribution=a;basis=b;}
 function setBasis(StoredHistory.Basis calldata b) external {basis=b;}
 function setExit(uint256 seq,StoredHistory.Exit calldata e) external {exits[seq]=e;}
 function linkedBasis(uint256) external view returns(StoredHistory.Basis memory){return basis;}
 function linkedExit(uint256,uint256 seq,bool final_) external view returns(StoredHistory.Exit memory){return exits[final_?3:seq];}
}
contract MockHistoryAttribution {
 address public core;address public funding;address public partialSettlement;address public owner;
 StoredHistory.Trace private trace;StoredHistory.Config private cfg;StoredHistory.Log private log;
 uint256 private finalIndex=3;mapping(uint256=>StoredHistory.Transition) private rows;
 function setup(address c,address f,address p,address a,StoredHistory.Trace calldata t,bytes32 policy) external {core=c;funding=f;partialSettlement=p;owner=a;trace=t;cfg=StoredHistory.Config(1,policy,100,100,1,8,4);log=StoredHistory.Log(3,0,0,120);}
 function setTrace(StoredHistory.Trace calldata t) external {trace=t;}
 function setLog(StoredHistory.Log calldata l) external {log=l;}
 function setFinal(uint256 n) external {finalIndex=n;}
 function setConfig(StoredHistory.Config calldata c) external {cfg=c;}
 function setTransition(uint256 ordinal,StoredHistory.Transition calldata t) external {rows[ordinal]=t;}
 function setTransitions(uint256 start,StoredHistory.Transition[] calldata values) external {for(uint256 i;i<values.length;i++)rows[start+i]=values[i];}
 function config(uint256) external view returns(StoredHistory.Config memory){return cfg;}
 function traces(uint256) external view returns(StoredHistory.Trace memory){return trace;}
 function logs(bytes32) external view returns(StoredHistory.Log memory){return log;}
 function finalOrdinal(uint256) external view returns(uint256){return finalIndex;}
 function accountKey(uint256 id,address who) external view returns(bytes32){return keccak256(abi.encode(address(this),partialSettlement,core,funding,id,cfg.sid,cfg.policy,who));}
 function transition(uint256,address,uint256 ordinal) external view returns(StoredHistory.Transition memory){return rows[ordinal];}
}
