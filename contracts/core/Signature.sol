pragma solidity 0.5.17;

// SPDX-License-Identifier:MIT
contract VerifySignature {
	function getMessageHash(
		bytes32 loanId,
		address receiver,
		uint256 depositAmount,
		bytes4 methodSig
	) public pure returns (bytes32) {
		return keccak256(abi.encodePacked(loanId, receiver, depositAmount, methodSig));
	}

	function getEthSignedMessagehash(bytes32 messageHash) internal pure returns (bytes32) {
		return (keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash)));
	}

	function verify(
		bytes32 loanId,
		address receiver,
		uint256 depositAmount,
		bytes4 methodSig,
		bytes memory sig
	) public pure returns (bool) {
		bytes32 messageHash = getMessageHash(loanId, receiver, depositAmount, methodSig);
		bytes32 ethSignedMessageHash = getEthSignedMessagehash(messageHash);
		return receiver == recoverSigner(ethSignedMessageHash, sig);
	}

	function recoverSigner(bytes32 ethSignedMessageHash, bytes memory sig) internal pure returns (address) {
		// Appendix F in the Ethereum Yellow paper (https://ethereum.github.io/yellowpaper/paper.pdf), defines
		// the valid range for s in (281): 0 < s < secp256k1n ÷ 2 + 1, and for v in (282): v ∈ {27, 28}. Most
		// signatures from current libraries generate a unique signature with an s-value in the lower half order.
		//
		// If your library generates malleable signatures, such as s-values in the upper range, calculate a new s-value
		// with 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141 - s1 and flip v from 27 to 28 or
		// vice versa. If your library also generates signatures with 0/1 for v instead 27/28, add 27 to v to accept
		// these malleable signatures as well.
		(bytes32 r, bytes32 s, uint8 v) = splitSignature(sig);
		require(uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "ECDSA: invalid signature 's' value");
		require(v == 27 || v == 28, "ECDSA: invalid signature 'v' value");
		address signer = ecrecover(ethSignedMessageHash, v, r, s);
		require(signer != address(0), "ECDSA: invalid signature");
		return signer;
	}

	function splitSignature(bytes memory sig)
		internal
		pure
		returns (
			bytes32 r,
			bytes32 s,
			uint8 v
		)
	{
		require(sig.length == 65, "invalid signature length");
		assembly {
			r := mload(add(sig, 32)) //add(sig,32) ==> Skips first 32 bytes . mload(something)=> load next 32bytes starting at memory address something
			s := mload(add(sig, 64))
			v := byte(0, mload(add(sig, 96)))
		}
	}
}
