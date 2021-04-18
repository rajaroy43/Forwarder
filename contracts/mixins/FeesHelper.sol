/**
 * Copyright 2017-2020, bZeroX, LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0.
 */

pragma solidity 0.5.17;

import "../core/State.sol";
import "../openzeppelin/SafeERC20.sol";
import "../feeds/IPriceFeeds.sol";
import "../events/FeesEvents.sol";
import "../mixins/ProtocolTokenUser.sol";

contract FeesHelper is State, ProtocolTokenUser, FeesEvents {
	using SafeERC20 for IERC20;

	// calculate trading fee
	function _getTradingFee(uint256 feeTokenAmount) internal view returns (uint256) {
		return feeTokenAmount.mul(tradingFeePercent).div(10**20);
	}

	// calculate loan origination fee
	function _getBorrowingFee(uint256 feeTokenAmount) internal view returns (uint256) {
		return feeTokenAmount.mul(borrowingFeePercent).div(10**20);
	}

	/**
	 * @dev settles the trading fee and pays the token reward to the user.
	 * @param user the address to send the reward to
	 * @param loanId the Id of the associated loan - used for logging only.
	 * @param feeToken the address of the token in which the trading fee is paid
	 * */
	function _payTradingFee(
		address user,
		bytes32 loanId,
		address feeToken,
		uint256 tradingFee
	) internal {
		if (tradingFee != 0) {
			//increase the storage variable keeping track of the accumulated fees
			tradingFeeTokensHeld[feeToken] = tradingFeeTokensHeld[feeToken].add(tradingFee);

			emit PayTradingFee(user, feeToken, loanId, tradingFee);

			//pay the token reward to the user
			_payFeeReward(user, loanId, feeToken, tradingFee);
		}
	}

	/**
	 * @dev settles the borrowing fee and pays the token reward to the user.
	 * @param user the address to send the reward to
	 * @param loanId the Id of the associated loan - used for logging only.
	 * @param feeToken the address of the token in which the borrowig fee is paid
	 * @param borrowingFee the height of the fee
	 * */
	function _payBorrowingFee(
		address user,
		bytes32 loanId,
		address feeToken,
		uint256 borrowingFee
	) internal {
		if (borrowingFee != 0) {
			//increase the storage variable keeping track of the accumulated fees
			borrowingFeeTokensHeld[feeToken] = borrowingFeeTokensHeld[feeToken].add(borrowingFee);

			emit PayBorrowingFee(user, feeToken, loanId, borrowingFee);
			//pay the token reward to the user
			_payFeeReward(user, loanId, feeToken, borrowingFee);
		}
	}

	/**
	 * @dev settles the lending fee (based on the interest). Pays no token reward to the user.
	 * @param user the address to send the reward to
	 * @param feeToken the address of the token in which the lending fee is paid
	 * @param lendingFee the height of the fee
	 * */
	function _payLendingFee(
		address user,
		address feeToken,
		uint256 lendingFee
	) internal {
		if (lendingFee != 0) {
			//increase the storage variable keeping track of the accumulated fees
			lendingFeeTokensHeld[feeToken] = lendingFeeTokensHeld[feeToken].add(lendingFee);

			emit PayLendingFee(user, feeToken, lendingFee);

			//// NOTE: Lenders do not receive a fee reward ////
		}
	}

	// settles and pays borrowers based on the fees generated by their interest payments
	function _settleFeeRewardForInterestExpense(
		LoanInterest storage loanInterestLocal,
		bytes32 loanId,
		address feeToken,
		address user,
		uint256 interestTime
	) internal {
		// this represents the fee generated by a borrower's interest payment
		uint256 interestExpenseFee =
			interestTime.sub(loanInterestLocal.updatedTimestamp).mul(loanInterestLocal.owedPerDay).div(86400).mul(lendingFeePercent).div(
				10**20
			);

		loanInterestLocal.updatedTimestamp = interestTime;

		if (interestExpenseFee != 0) {
			_payFeeReward(user, loanId, feeToken, interestExpenseFee);
		}
	}

	/**
	 * @dev pays the potocolToken reward to user. The reward is worth 50% of the trading/borrowing fee.
	 * @param user the address to send the reward to
	 * @param loanId the Id of the associeated loan - used for logging only.
	 * @param feeToken the address of the token in which the trading/borrowig fee was paid
	 * @param feeAmount the height of the fee
	 * */
	function _payFeeReward(
		address user,
		bytes32 loanId,
		address feeToken,
		uint256 feeAmount
	) internal {
		uint256 rewardAmount;
		address _priceFeeds = priceFeeds;
		//note: this should be refactored.
		//calculate the reward amount, querying the price feed
		(bool success, bytes memory data) =
			_priceFeeds.staticcall(
				abi.encodeWithSelector(
					IPriceFeeds(_priceFeeds).queryReturn.selector,
					feeToken,
					protocolTokenAddress, // price rewards using BZRX price rather than vesting token price
					feeAmount / 2 // 50% of fee value
				)
			);
		assembly {
			if eq(success, 1) {
				rewardAmount := mload(add(data, 32))
			}
		}

		if (rewardAmount != 0) {
			address rewardToken;
			(rewardToken, success) = _withdrawProtocolToken(user, rewardAmount);
			if (success) {
				protocolTokenPaid = protocolTokenPaid.add(rewardAmount);

				emit EarnReward(user, rewardToken, loanId, rewardAmount);
			}
		}
	}
}
