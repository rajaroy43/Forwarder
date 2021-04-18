//Here is the command line  use to launch the Ganache CLI client:
//ganache-cli -d 100000000 --allowUnlimitedContractSize
const HDWalletProvider = require("@truffle/hdwallet-provider");
const wrapProvider = require("arb-ethers-web3-bridge").wrapProvider;
const mnemonic = "myth like bonus scare over problem client lizard pioneer submit female collect";
module.exports = {
	// Configure your compilers
	compilers: {
		solc: {
			version: "0.5.17", // Fetch exact version from solc-bin (default: truffle's version)
			// docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
			// settings: {          // See the solidity docs for advice about optimization and evmVersion
			settings: {
				// See the solidity docs for advice about optimization and evmVersion
				optimizer: {
					enabled: true,
					runs: 200,
				},
			},
			//  evmVersion: "byzantium"
			// }
		},
	},
	/**
	 * Networks define how you connect to your  client and let you set the
	 * defaults web3 uses to send transactions. If you don't specify one truffle
	 * will spin up a development blockchain for you on port 8545 when you
	 * run `develop` or `test`. You can ask a truffle command to use a specific
	 * network from the command line, e.g
	 *
	 * $ truffle test --network <network-name>
	 */

	networks: {
		// Useful for testing. The `development` name is special - truffle uses it by default
		// if it's defined here and no other network is specified at the command line.
		// You should run a client (like ganache-cli, geth or parity) in a separate terminal
		// tab if you use this network and you must also set the `host`, `port` and `network_id`
		// options below to some value.
		//
		development: {
			host: "localhost", // Localhost (default: none)
			port: 8545, // Standard Ethereum port (default: none)
			network_id: "*", // Any network (default: none)
		},
		arbitrum: {
			provider: function () {
				return wrapProvider(new HDWalletProvider(mnemonic, "ws://127.0.0.1:8547"));
			},
			network_id: "*", // Match any network id
			gasPrice: 0,
		},
		remote_arbitrum: {
			provider: function () {
				return wrapProvider(new HDWalletProvider(mnemonic, "https://kovan3.arbitrum.io/rpc"));
			},
			network_id: "*", // Match any network id
			gasPrice: 0,
		},
	},
};
