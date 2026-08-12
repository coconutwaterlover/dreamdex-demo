export const operatorRegistryAbi = [
  {
    type: "function",
    name: "setOperatorApprovalGlobal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "selectors", type: "bytes4[]" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isGloballyApproved",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
