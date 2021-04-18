const LoanClosings = artifacts.require("LoanClosings");
module.exports = function (deployer) {
	deployer.deploy(LoanClosings);
};
