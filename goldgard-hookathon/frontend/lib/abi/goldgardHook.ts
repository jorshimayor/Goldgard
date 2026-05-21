export const goldgardHookAbi = [
  {
    type: "function",
    name: "getReactiveAlert",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "level", type: "uint8" },
      { name: "until", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "premiumBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "minRebalanceAmountIn",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isEligible",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "poolId", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "previewClaim",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "poolId", type: "bytes32" },
    ],
    outputs: [{ name: "payoutAssets", type: "uint256" }],
  },
  {
    type: "event",
    name: "AlertLevelRaised",
    inputs: [
      { indexed: false, name: "level", type: "uint8" },
      { indexed: false, name: "until", type: "uint64" },
    ],
    anonymous: false,
  },
] as const;
