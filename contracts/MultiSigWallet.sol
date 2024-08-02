// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

contract MultiSigWallet is Ownable2Step {
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private signers;
    mapping(bytes32 => mapping(address => bool)) private confirmations;
    mapping(bytes32 => uint) private confirmationCounts;
    mapping(bytes32 => bool) private executedTransactions;
    uint public requiredSignatures = 0;

    event TransactionSubmitted(bytes32 indexed txHash);
    event TransactionConfirmed(bytes32 indexed txHash, address indexed signer);
    event TransactionExecuted(bytes32 indexed txHash);

    modifier onlySigner() {
        require(signers.contains(msg.sender), "Not a signer");
        _;
    }

    function submitTransaction(
        address destination,
        uint value,
        bytes memory data
    ) public onlySigner returns (bytes32) {
        bytes32 txHash = keccak256(abi.encode(destination, value, data));
        emit TransactionSubmitted(txHash);
        confirmTransaction(txHash, destination, value, data);
        return txHash;
    }

    function confirmTransaction(
        bytes32 txHash,
        address destination,
        uint value,
        bytes memory data
    ) public onlySigner {
        require(
            !confirmations[txHash][msg.sender],
            "Transaction already confirmed"
        );
        confirmations[txHash][msg.sender] = true;
        confirmationCounts[txHash] += 1;
        emit TransactionConfirmed(txHash, msg.sender);

        if (
            confirmationCounts[txHash] >= requiredSignatures &&
            !executedTransactions[txHash]
        ) {
            executeTransaction(txHash, destination, value, data);
        }
    }

    function executeTransaction(
        bytes32 txHash,
        address destination,
        uint value,
        bytes memory data
    ) internal {
        require(
            confirmationCounts[txHash] >= requiredSignatures,
            "Not enough confirmations"
        );
        require(!executedTransactions[txHash], "Transaction already executed");

        executedTransactions[txHash] = true;

        (bool success, ) = destination.call{value: value}(data);
        require(success, "Transaction execution failed");
        emit TransactionExecuted(txHash);
    }

    function addSigner(address newSigner) public onlyOwner {
        if (signers.length() == 0 && requiredSignatures == 0) {
            requiredSignatures = 1;
        }
        signers.add(newSigner);
    }

    function removeSigner(address signer) public onlyOwner {
        signers.remove(signer);
    }

    function setRequiredSignatures(
        uint newRequiredSignatures
    ) public onlyOwner {
        require(
            newRequiredSignatures <= signers.length(),
            "Not enough signers"
        );
        require(requiredSignatures != newRequiredSignatures);
        requiredSignatures = newRequiredSignatures;
    }
}
