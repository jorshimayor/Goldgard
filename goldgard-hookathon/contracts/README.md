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
  --private-key <ANVIL_PRIVATE_KEY> \
  --broadcast
```

### 10% Swing Simulation

```bash
forge script script/SimulatePriceSwing.s.sol:SimulatePriceSwing \
  --rpc-url http://127.0.0.1:8545 \
  --private-key <ANVIL_PRIVATE_KEY> \
  --broadcast
```
