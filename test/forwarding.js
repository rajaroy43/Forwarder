const { assert } = require("chai");

const LoanTokenLogicStandard = artifacts.require("LoanTokenLogicStandard");
const sovrynProtocol = artifacts.require("sovrynProtocol");
const LoanToken = artifacts.require("LoanToken");
const TestWrbtc = artifacts.require("TestWrbtc");
const TestToken = artifacts.require("TestToken");
const ISovryn = artifacts.require("ISovryn");
const ProtocolSettings = artifacts.require("ProtocolSettings");
const LoanSettings = artifacts.require("LoanSettings");
const LoanMaintenance = artifacts.require("LoanMaintenance");
const LoanOpenings = artifacts.require("LoanOpenings");
const SwapsExternal = artifacts.require("SwapsExternal");
const LoanClosings = artifacts.require("LoanClosings");
const Forwarding = artifacts.require("Forwarding");
const PriceFeedsLocal = artifacts.require("PriceFeedsLocal");
const TestSovrynSwap = artifacts.require("TestSovrynSwap");
const SwapsImplLocal = artifacts.require("SwapsImplLocal");

contract("Forwarding ", async (accounts) => {
	let loanTokenLogic;
	let testWrbtc;
	let doc;
	let sovryn;
	let loanTokenV2;
	let forwarding;
	let wei = web3.utils.toWei;
	before(async () => {
		loanTokenLogic = await LoanTokenLogicStandard.new();
		testWrbtc = await TestWrbtc.new();
		doc = await TestToken.new("dollar on chain", "DOC", 18, web3.utils.toWei("20000", "ether"));
		// Deploying sovrynProtocol
		const sovrynproxy = await sovrynProtocol.new();
		sovryn = await ISovryn.at(sovrynproxy.address);
		await sovryn.replaceContract((await LoanClosings.new()).address);
		await sovryn.replaceContract((await ProtocolSettings.new()).address);
		await sovryn.replaceContract((await LoanSettings.new()).address);
		await sovryn.replaceContract((await LoanMaintenance.new()).address);
		await sovryn.replaceContract((await SwapsExternal.new()).address);
		await sovryn.replaceContract((await LoanOpenings.new()).address);

		//Deploying LoanToken
		loanToken = await LoanToken.new(accounts[0], loanTokenLogic.address, sovryn.address, testWrbtc.address);
		await loanToken.initialize(doc.address, "SUSD", "SUSD");
		// console.log((await loanToken.initialPrice()).toString());
		loanTokenV2 = await LoanTokenLogicStandard.at(loanToken.address);
		const loanTokenAddress = await loanToken.loanTokenAddress();
		if (accounts[0] == (await sovryn.owner())) {
			await sovryn.setLoanPool([loanTokenV2.address], [loanTokenAddress]);
		}

		//Setting price feeds e.g. price like 1wRBTC == 100 DOC

		const feeds = await PriceFeedsLocal.new(testWrbtc.address, sovryn.address);
		await feeds.setRates(doc.address, testWrbtc.address, wei("0.01", "ether"));

		//We can set protocol price as well and we can also set protoCol token as well
		// await sovryn.setProtocolTokenAddress(newToken.address);
		// await feeds.setProtocolTokenEthPrice(wei("0.01", "ether"));

		const swaps = await SwapsImplLocal.new();
		const sovrynSwapSimulator = await TestSovrynSwap.new(feeds.address);
		await sovryn.setSovrynSwapContractRegistryAddress(sovrynSwapSimulator.address);

		await sovryn.setSupportedTokens([doc.address, testWrbtc.address], [true, true]);

		await sovryn.setPriceFeedContract(
			feeds.address //priceFeeds
		);
		await sovryn.setSwapsImplContract(
			swaps.address // swapsImpl
		);
		await sovryn.setFeesController(accounts[0]);
		await sovryn.setWrbtcToken(testWrbtc.address);

		params = [
			"0x0000000000000000000000000000000000000000000000000000000000000000",
			false,
			accounts[0],
			doc.address,
			testWrbtc.address,
			wei("20", "ether"),
			wei("15", "ether"),
			2419200,
		];

		await loanTokenV2.setupLoanParams([params], true);
		await loanTokenV2.setupLoanParams([params], false);

		//        setting up interest rates

		const baseRate = wei("1", "ether");
		const rateMultiplier = wei("20.25", "ether");
		const targetLevel = wei("80", "ether");
		const kinkLevel = wei("90", "ether");
		const maxScaleRate = wei("100", "ether");
		await loanTokenV2.setDemandCurve(baseRate, rateMultiplier, baseRate, rateMultiplier, targetLevel, kinkLevel, maxScaleRate);

		// const borrowInterestRate = await loanTokenV2.borrowInterestRate();
		// console.log("borrowInterestRate: ", borrowInterestRate.toString());

		//Deploying Forwarding Contract
		forwarding = await Forwarding.new();

		//Asking one-time approval for ForwardingContract(1Billion token)
		const maxAmmount = wei("1000000000", "ether");
		await doc.approve(forwarding.address, maxAmmount);
		await testWrbtc.approve(forwarding.address, maxAmmount);
		//Ging some real TestWrbtc to testWrbtc, so that when loan close then it give my collateral as realTestWrbtc
		await testWrbtc.deposit({ value: wei("1", "ether") });
	});
	// it("Deposit 12 DOC token", async function () {
	// 	const loanTokenAddress = await loanToken.loanTokenAddress();
	// 	assert.equal(loanTokenAddress, doc.address, "Doc address not set yet");
	// 	const depositAmount = wei("12", "ether");
	// 	await forwarding.depositLendToken(loanTokenV2.address, doc.address, accounts[0], depositAmount);
	// 	assert.equal(
	// 		(await loanTokenV2.totalSupply()).toString(),
	// 		(await loanTokenV2.balanceOf(accounts[0])).toString(),
	// 		"TotalSupply!=user balance"
	// 	);
	// });
	// it("Try to get more iTOken than actual DOC Balance", async function () {
	// 	try {
	// 		//More than 20K just 20k+1 tokens
	// 		const depositAmount = wei("20001", "ether");
	// 		await forwarding.depositLendToken(loanTokenV2.address, doc.address, accounts[0], depositAmount);
	// 	} catch (error) {
	// 		console.log(error);
	// 		assert.ok("invalid transfer" == error["reason"], "getting not actual error");
	// 	}
	// });
	it("Margin trading  with 4X leverage with DOC token and topUp position by 12rwBTC", async () => {
		// We have to transfer some doc to sovryn,otherwise it gonna fail here because we wan't 20Doc to be 4X
		//so,we will mint 20*3 doc(Transfering 60 tokens to LoanToken Adress) to loanTokenV2 address
		await doc.mint(loanTokenV2.address, wei("60", "ether"));

		await forwarding.marginTrading(
			loanTokenV2.address,
			"0x0000000000000000000000000000000000000000000000000000000000000000", //loanId  (0 for new loans)
			wei("3", "ether"), // leverageAmount
			wei("20", "ether"), //loanTokenSent
			0, // no collateral token sent
			testWrbtc.address, //collateralTokenAddress
			accounts[0], //trader,
			"0x" //loanDataBytes (only required with rBTC)
		);

		//Top up position by givng 12 wrbtc

		// const beforeDepositLoan = await sovryn.getUserLoans(accounts[0], 0, 1, 1, false, false);
		// const beforeDepositCollateral = beforeDepositLoan[0].collateral;
		// const depositAmount = wei("12", "ether");

		// //Giving 12testWrbtc to myself so that i can deposit 12testWrbtc to protocol,to top-up my position
		// await testWrbtc.mint(accounts[0], depositAmount);

		// await forwarding.depositCollateral(sovryn.address, testWrbtc.address, beforeDepositLoan[0].loanId, depositAmount);
		// const afterDepositLoan = await sovryn.getUserLoans(accounts[0], 0, 1, 1, false, false);
		// const afterDepositCollateral = afterDepositLoan[0].collateral;
		// assert.ok(parseInt(afterDepositCollateral) > parseInt(beforeDepositCollateral), "not Deposited ");
	});
	// it("Margin trading  with 4X leverage with DOC token Get fail because contract don't have enough Doc(means approx 80Doc)", async () => {
	// 	// We have to transfer some doc to sovryn,otherwise it gonna fail here because we wan't 20Doc to be 4X
	// 	//so,we will mint 20*3 doc(Transfering 60 tokens to LoanToken Adress) to loanTokenV2 address
	// 	// await doc.mint(loanTokenV2.address, wei("60", "ether"));

	// 	try {
	// 		await forwarding.marginTrading(
	// 			loanTokenV2.address,
	// 			"0x0000000000000000000000000000000000000000000000000000000000000000", //loanId  (0 for new loans)
	// 			wei("3", "ether"), // leverageAmount
	// 			wei("20", "ether"), //loanTokenSent
	// 			0, // no collateral token sent
	// 			testWrbtc.address, //collateralTokenAddress
	// 			accounts[0], //trader,
	// 			"0x" //loanDataBytes (only required with rBTC)
	// 		);
	// 	} catch (error) {
	// 		//24 is leverage Balance>= Doc which  loanToken held
	// 		assert.ok(error["reason"] == "24");
	// 	}
	// });

	// it("Borrowing loan ammount of  12 DOC  and closing this loan by  closeWithDepositWithSig", async () => {
	// 	// minting withdrawAmmount (12DOC) tokens to loanToken + some interest as 0.5 so total is 12.5 so that we can borrow from loanToken
	// 	await doc.mint(loanTokenV2.address, wei("12.5", "ether"));

	// 	const collateralTokenAddress = testWrbtc.address;
	// 	const depositAmount = wei("12", "ether");
	// 	const collateralTokenSent = await sovryn.getRequiredCollateral(
	// 		doc.address,
	// 		collateralTokenAddress,
	// 		depositAmount,
	// 		wei("50", "ether"),
	// 		true
	// 	);
	// 	// console.log(collateralTokenSent.toString());

	// 	const withdrawAmount = depositAmount;
	// 	await forwarding.borrow(
	// 		loanTokenV2.address,
	// 		"0x0000000000000000000000000000000000000000000000000000000000000000", //loanId  (0 for new loans)
	// 		withdrawAmount,
	// 		2419200,
	// 		collateralTokenSent,
	// 		collateralTokenAddress, //collateralTokenAddress
	// 		accounts[0],
	// 		accounts[0],
	// 		"0x" //loanDataBytes (only required with rBTC)
	// 	);

	// 	//Now closeWithDepositWithSig (closing user loan by their signatures)
	// 	//Creating user signature by loanid,receiver,depositAmmount,methodSignature
	// 	const methodSig = "0x50b38565";
	// 	const loan = await sovryn.getUserLoans(accounts[0], 0, 3, 2, false, false); //Here 2 is  non-margin trade loans
	// 	const loanId = loan[0].loanId;
	// 	const receiver = accounts[0];
	// 	const hash = await sovryn.getHash(loanId, receiver, withdrawAmount, methodSig);

	// 	//repaying loan then it give us collateral as real RBTC (here not wrBTC but Rtbc)

	// 	const beforeRepayWBtcAmmount = parseInt(await web3.eth.getBalance(accounts[0])) / 1e18;
	// 	const userSig = await web3.eth.sign(hash, accounts[0]);
	// 	await forwarding.closeWithDepositWithUserSig(sovryn.address, doc.address, loanId, receiver, withdrawAmount, userSig);
	// 	const AfterRepaywRBTCAmmount = parseInt(await web3.eth.getBalance(accounts[0])) / 1e18;
	// 	assert.ok(AfterRepaywRBTCAmmount > beforeRepayWBtcAmmount, "Loan is not close by user");
	// });
	// it("Borrowing loan ammount of  12 DOC  and closing this loan by closeWithDepositWithSig by thirdParty ", async () => {
	// 	// minting withdrawAmmount (12DOC) tokens to loanToken + some interest as 0.5 so total is 12.5 so that we can borrow from loanToken
	// 	await doc.mint(loanTokenV2.address, wei("12.5", "ether"));
	// 	const collateralTokenAddress = testWrbtc.address;
	// 	const depositAmount = wei("12", "ether");
	// 	const collateralTokenSent = await sovryn.getRequiredCollateral(
	// 		doc.address,
	// 		collateralTokenAddress,
	// 		depositAmount,
	// 		wei("50", "ether"),
	// 		true
	// 	);
	// 	// console.log(collateralTokenSent.toString());

	// 	const withdrawAmount = depositAmount;
	// 	await forwarding.borrow(
	// 		loanTokenV2.address,
	// 		"0x0000000000000000000000000000000000000000000000000000000000000000", //loanId  (0 for new loans)
	// 		withdrawAmount,
	// 		2419200,
	// 		collateralTokenSent,
	// 		collateralTokenAddress, //collateralTokenAddress
	// 		accounts[0],
	// 		accounts[0],
	// 		"0x" //loanDataBytes (only required with rBTC)
	// 	);

	// 	//Now closeWithDepositWithSig (closing user loan by their signatures)
	// 	//Creating user signature by loanid,receiver,depositAmmount,methodSignature
	// 	const methodSig = "0x50b38565";
	// 	const loan = await sovryn.getUserLoans(accounts[0], 0, 3, 2, false, false); //Here 2 is  non-margin trade loans
	// 	const loanId = loan[0].loanId;
	// 	const receiver = accounts[0];
	// 	const hash = await sovryn.getHash(loanId, receiver, withdrawAmount, methodSig);

	// 	const userSig = await web3.eth.sign(hash, accounts[2]);

	// 	//Catching error and save by try/catch Block
	// 	try {
	// 		await doc.mint(accounts[2], withdrawAmount);
	// 		await doc.approve(forwarding.address, withdrawAmount, { from: accounts[2] });
	// 		await testWrbtc.deposit({ value: wei("1", "ether") });

	// 		await forwarding.closeWithDepositWithUserSig(sovryn.address, doc.address, loanId, receiver, withdrawAmount, userSig, {
	// 			from: accounts[2],
	// 		});
	// 	} catch (error) {
	// 		// Loan Don't close by third party so it give UnAuthorize User
	// 		assert.ok(error["reason"] == "UnAuthorize User");
	// 	}
	// });
	// it("Borrowing loan ammount of  12 DOC  from loanToken and loanToken don't have enough ammount of DOC ", async () => {
	// 	const collateralTokenAddress = testWrbtc.address;
	// 	const depositAmount = wei("12", "ether");
	// 	const collateralTokenSent = await sovryn.getRequiredCollateral(
	// 		doc.address,
	// 		collateralTokenAddress,
	// 		depositAmount,
	// 		wei("50", "ether"),
	// 		true
	// 	);
	// 	// console.log(collateralTokenSent.toString());

	// 	const withdrawAmount = depositAmount;
	// 	try {
	// 		await forwarding.borrow(
	// 			loanTokenV2.address,
	// 			"0x0000000000000000000000000000000000000000000000000000000000000000", //loanId  (0 for new loans)
	// 			withdrawAmount,
	// 			2419200,
	// 			collateralTokenSent,
	// 			collateralTokenAddress, //collateralTokenAddress
	// 			accounts[0],
	// 			accounts[0],
	// 			"0x" //loanDataBytes (only required with rBTC)
	// 		);
	// 	} catch (error) {
	// 		assert.ok(error["reason"] == "24");
	// 	}
	// });
	// it("Swap 10 Doc to wrBTC tokens using swapExternal", async function () {
	// 	const sourceTokenAmount = wei("10", "ether");
	// 	const beforeSwappingToWrbtcAmmount = parseInt((await testWrbtc.balanceOf(accounts[0])).toString());

	// 	await forwarding.swapExternal(sovryn.address, doc.address, testWrbtc.address, accounts[0], accounts[0], sourceTokenAmount, 0, "0x");
	// 	const afterSwappingToWrbtcAmmount = parseInt((await testWrbtc.balanceOf(accounts[0])).toString());
	// 	assert.ok(afterSwappingToWrbtcAmmount > beforeSwappingToWrbtcAmmount, "After swapping Wrbtc greater than zero");
	// });
	// it("Swap 0.1wrBTC to  Doc  tokens using swapExternal", async function () {
	// 	const sourceTokenAmount = wei("0.1", "ether");
	// 	const beforeSwappingToDOCAmmount = parseInt((await doc.balanceOf(accounts[0])).toString()) / 1e18;
	// 	//Minting some testWrtbc to myself so that i can transfer testWbtc to protocol Address and get return doc Tokens
	// 	await testWrbtc.mint(accounts[0], sourceTokenAmount);

	// 	await forwarding.swapExternal(sovryn.address, testWrbtc.address, doc.address, accounts[0], accounts[0], sourceTokenAmount, 0, "0x");
	// 	const afterSwappingToDocAmmount = parseInt((await doc.balanceOf(accounts[0])).toString()) / 1e18;
	// 	assert.ok(afterSwappingToDocAmmount > beforeSwappingToDOCAmmount, "After swapping Doc must be  greater than intial Ammount");
	// });
});
