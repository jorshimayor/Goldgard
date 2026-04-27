export const goldgardHookAbi = [
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
] as const;

