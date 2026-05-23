## Goldgard (Foundry)

This folder contains the hookathon scope: Uniswap v4 hook + supporting contracts, with tests and scripts.

### Key Contracts

- [GoldgardHook.sol](file:///home/jorel/Goldgard/goldgard-hookathon/contracts/src/GoldgardHook.sol): `beforeSwap`, `afterSwap`, `afterAddLiquidity`
- [SafetyModule.sol](file:///home/jorel/Goldgard/goldgard-hookathon/contracts/src/SafetyModule.sol): ERC‑4626 insurance reserve + claim flow (14‑day cooldown)
- [HedgeReserve.sol](file:///home/jorel/Goldgard/goldgard-hookathon/contracts/src/HedgeReserve.sol): inventory used for atomic rebalancing
- [RewardDistributor.sol](file:///home/jorel/Goldgard/goldgard-hookathon/contracts/src/RewardDistributor.sol): ERC‑6909 GGARD claims
- [OracleAdapter.sol](file:///home/jorel/Goldgard/goldgard-hookathon/contracts/src/OracleAdapter.sol): TWAP (pool) + Chainlink/mock adapter

### Build & Test

```bash
forge build
forge test
```

### Local Demo (Anvil)

Terminal A:

```bash
anvil
```

Terminal B:

```bash
forge script script/DeployDemo.s.sol:DeployDemo \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
```

### 10% Swing Simulation

```bash
forge script script/SimulatePriceSwing.s.sol:SimulatePriceSwing \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
```



Estimated gas price: 2.170423988 gwei

Estimated total gas used for script: 24067892

Estimated amount required: 0.052237530137393296 ETH

==========================

##### sepolia
✅  [Success] Hash: 0xb671f193ee26deaa3ab4ea5d59b85a4f43023b4e92cb7ca976f998899967091d
Contract: MockAggregatorV3
Contract Address: 0xD2B4047843Ea81Bff25CC022cC045888A93F3fa2
Block: 10905082
Paid: 0.00075950435670464 ETH (711070 gas * 1.068114752 gwei)


##### sepolia
✅  [Success] Hash: 0x652feae09a1a4e31e789531062e2797931ae1c42bda52934590538665a23476d
Contract: MockERC20
Function: mint(address,uint256)
Block: 10905082
Paid: 0.000072783475430784 ETH (68142 gas * 1.068114752 gwei)


##### sepolia
✅  [Success] Hash: 0x76e13fc2fd02748b1a9ee0bafa9bd34dfc6cbc2fb7171b3d3ac8e53fdb9aa524
Contract: MockERC20
Contract Address: 0x6f1947c64569BC394Ccb312eFE12AA7AA7c49FDa
Paid: 0.000049399239165248 ETH (46249 gas * 1.068114752 gwei)