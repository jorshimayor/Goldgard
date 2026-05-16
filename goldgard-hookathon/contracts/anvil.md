Available Accounts
==================

(0) 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000.000000000000000000 ETH)
(1) 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000.000000000000000000 ETH)
(2) 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (10000.000000000000000000 ETH)
(3) 0x90F79bf6EB2c4f870365E785982E1f101E93b906 (10000.000000000000000000 ETH)
(4) 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 (10000.000000000000000000 ETH)
(5) 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc (10000.000000000000000000 ETH)
(6) 0x976EA74026E726554dB657fA54763abd0C3a0aa9 (10000.000000000000000000 ETH)
(7) 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 (10000.000000000000000000 ETH)
(8) 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f (10000.000000000000000000 ETH)
(9) 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720 (10000.000000000000000000 ETH)

Private Keys
==================

(0) 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
(1) 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
(2) 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
(3) 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
(4) 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
(5) 0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba
(6) 0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e
(7) 0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356
(8) 0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97
(9) 0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6

Wallet
==================
Mnemonic:          test test test test test test test test test test test junk
Derivation path:   m/44'/60'/0'/0/


Chain ID
==================

31337

Base Fee
==================

1000000000

Gas Limit
==================

30000000

Genesis Timestamp
==================

1778937612

Genesis Number
==================




jorel@Jor-el:~/Goldgard/goldgard-hookathon/contracts$ forge script script/DeployDemo.s.sol:DeployDemo --rpc-url http://127.0.0.1:8545 --broadcast
[⠢] Compiling...
No files changed, compilation skipped
Script ran successfully.

## Setting up 1 EVM.

==========================

Chain 31337

Estimated gas price: 2.000000001 gwei

Estimated total gas used for script: 22283046

Estimated amount required: 0.044566092022283046 ETH

==========================

##### anvil-hardhat
✅  [Success] Hash: 0x6c2395d2eebd3e9ff0d50824bfea3d91b3527721e474b1b30431de9d2c50c120
Contract: MockERC20
Block: 4
Paid: 0.000032725274675347 ETH (46201 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x9dab42ec41a8dc01f5387b1abb54690b49e3c6b5b80454766f4a6c185b90a024
Contract: OracleAdapter
Contract Address: 0xc6e7DF5E7b4f2A278906862b61205850344D4e7d
Block: 4
Paid: 0.000571336220622041 ETH (806603 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xe787e35af48806f36ace482fb17c19338ddcbec22895669e84d9e73b75b9601e
Contract: MockERC20
Function: mint(address,uint256)
Block: 4
Paid: 0.000036162770790138 ETH (51054 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x0d11e06b6faa2748e2aba0ee948687385dc2b2ed173bdf3f2e6aee62841cc5d2
Contract: MockAggregatorV3
Block: 4
Paid: 0.000035075493531493 ETH (49519 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xd9994c2cde57ea07dade3acf55f062f68352ad1551571447f919fb9044adadb2
Contract: StateView
Contract Address: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
Block: 2
Paid: 0.000593283135837119 ETH (654433 gas * 0.906560543 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x40b6fd80fde90c74bec1fdae41b9a7bb622b4208a7e47c923e5f6ff9ac91857e
Contract: PoolManager
Contract Address: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Block: 1
Paid: 0.003787265003787265 ETH (3787265 gas * 1.000000001 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x03a99ec41322c26a290ae508402809e7d69af00664277bf4d0a2d8cb7b60d2ff
Contract: SafetyModule
Contract Address: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
Block: 4
Paid: 0.000991482819728773 ETH (1399759 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xc9285cade19c485481bd941833a4723aaa4aa71fb5e517a0ea1a2cc8f4912b60
Contract: HedgeReserve
Contract Address: 0x0165878A594ca255338adfa4d48449f69242Eb8F
Block: 4
Paid: 0.000122261671519829 ETH (172607 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x159a6879341dbc193b19629f333a18f523fd79d301909b61d154390992161694
Contract: MockERC20
Function: mint(address,uint256)
Contract Address: 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
Block: 4
Paid: 0.000661976894499896 ETH (934568 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x53e3245e175db49e477a1720dd8024d7a263a772eb85939c2dc33c9ac195ac40
Contract: MockERC20
Block: 4
Paid: 0.002381035906108129 ETH (3361507 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xbc13632e6b11157fa494cf79ca69df37eb454e86f7d92f3fce1998d17bf19b9e
Contract: SafetyModule
Function: setHook(address)
Contract Address: 0x610178dA211FEF7D417bC0e6FeD39F05609AD788
Block: 4
Paid: 0.000401366806299921 ETH (566643 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xe3bc46a0af12d9ba98f250f2242adf70a8a08279e9b0b2ecb3c0dee943ab82a2
Contract: SafetyModule
Function: setClaimsView(address)
Block: 4
Paid: 0.000036162770790138 ETH (51054 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xcbd30e70a3794acc71621c9e8e150e45756e8d4573e2290bf5cd47751a3b0502
Contract: HedgeReserve
Function: setHook(address)
Block: 4
Paid: 0.000275279477142345 ETH (388635 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x93c9a40ccdae6558177392597a1a97724e69ab2e7dca975dd73fa8137d294ed7
Contract: GoldgardHook
Block: 4
Paid: 0.000032759274224803 ETH (46249 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x7dc3734bab11d2ef9949b2532cb06d7c10995c7f3470427b0848c1c5cadaff1c
Contract: GoldgardHook
Function: setPoolConfig((address,address,uint24,int24,address),(uint24,uint24,uint16,uint16,uint16,uint16,uint32,uint32,uint64))
Block: 4
Paid: 0.000032759274224803 ETH (46249 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xe44df64762286cc2464e6ab1104cf122bd77b4bcea6ba6a54e96e5a8513a3b63
Contract: OracleAdapter
Function: setHook(address)
Block: 4
Paid: 0.000020440812462526 ETH (28858 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x3d48f2400c99df1cc9d2fdb33d43978d64f3fd9e3dd8ead5a56e4abd7c96a663
Contract: RewardDistributor
Function: setHook(address)
Block: 4
Paid: 0.000036786095863498 ETH (51934 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x28e8792ab2d5b015785434de920f575cbcda0e184bf9a73c6c7f88ca7c18f9cd
Contract: OracleAdapter
Function: setPoolOracleConfig((address,address,uint24,int24,address),(address,uint32,uint8,uint8,uint8))
Block: 4
Paid: 0.000083607725408092 ETH (118036 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xc477f925970d157f708d915367c823ebed78fa0eb26417cbdf75f6ece9a07e78
Contract: RewardDistributor
Contract Address: 0x59b670e9fA9D0A427751Af201D676719a970857b
Block: 4
Paid: 0.000413370063905783 ETH (583589 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x61a8abda92191759b264bf24bf48c6234fad6e538104066c73c4cbc46bfd2bd8
Contract: PoolManager
Function: initialize((address,address,uint24,int24,address),uint160)
Block: 3
Paid: 0.000054389888335284 ETH (68142 gas * 0.798184502 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x9b831fad4c8a748d5bd33b079a4d8780f71ff00d4ca213f44dc0f9872c3af71e
Contract: MockERC20
Function: approve(address,uint256)
Block: 4
Paid: 0.000032605567928304 ETH (46032 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xc3dc5b96d593a83c650b5a236cda77252a26b9237a68447f9167198938ece72e
Contract: PoolModifyLiquidityTestNoChecks
Block: 4
Paid: 0.000032606276252251 ETH (46033 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x0fa31da5641dd4ad2da1b6c7ea685fece576fe757f2b96e875fb6fc45d2fa4fd
Contract: MockERC20
Function: approve(address,uint256)
Contract Address: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
Block: 3
Paid: 0.00056756505383714 ETH (711070 gas * 0.798184502 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xd0fd88386e3138133455a0c71bc14aa126fc3bfe15bb947118e777a90cc81723
Contract: SwapRouterNoChecks
Block: 4
Paid: 0.000032759274224803 ETH (46249 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xffdf344652501038c4fd38227579a3ecb7b37186f890002ea940cd20752fca18
Contract: MockERC20
Function: approve(address,uint256)
Contract Address: 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
Block: 4
Paid: 0.001176106039866429 ETH (1660407 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xf62be56c393a44a68711ab201116b5dd8001eba91b87130263c800a9c7690812
Contract: MockERC20
Function: approve(address,uint256)
Block: 4
Paid: 0.000032759274224803 ETH (46249 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x6e9f857e710c4c64ce70ade4723eeb554ebd2074e59c53de75d3f9c29a5d1caf
Contract: MockERC20
Function: mint(address,uint256)
Block: 4
Paid: 0.000034103673076209 ETH (48147 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xcb1fd391bcd2fd3cf83bbed44e8fd4f1dc592aace1abc0f5bd223052a0937d4d
Contract: PoolModifyLiquidityTestNoChecks
Function: modifyLiquidity((address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)
Block: 4
Paid: 0.000048266610396474 ETH (68142 gas * 0.708323947 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0x813dff3a92c0642855133900aa0bb973a790ab30b8a5c774b26c048b46a7450d
Contract: MockERC20
Function: mint(address,uint256)
Contract Address: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
Block: 3
Paid: 0.000567545897409092 ETH (711046 gas * 0.798184502 gwei)

✅ Sequence #1 on anvil-hardhat | Total Paid: 0.013123845046972728 ETH (16596280 gas * avg 0.734513406 gwei)
                                                                             

==========================

ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.

Transactions saved to: /home/jorel/Goldgard/goldgard-hookathon/contracts/broadcast/DeployDemo.s.sol/31337/run-latest.json

Sensitive values saved to: /home/jorel/Goldgard/goldgard-hookathon/contracts/cache/DeployDemo.s.sol/31337/run-latest.json