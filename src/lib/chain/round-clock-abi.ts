export const roundClockAbi = [
  {
    type: "function",
    name: "fireCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "lastTimestampMs",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "onEvent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "emitter", type: "address" },
      { name: "eventTopics", type: "bytes32[]" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "RoundFired",
    inputs: [
      { name: "timestampMs", type: "uint256", indexed: true },
      { name: "fireCount", type: "uint256", indexed: false },
    ],
  },
] as const;
