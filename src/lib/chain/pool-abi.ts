import { type Address } from "viem";

export const poolAbi = [
  {
    type: "function",
    name: "placeOrderFor",
    stateMutability: "payable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "isBid", type: "bool" },
      { name: "userData", type: "uint64" },
      { name: "price", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "expireTimestampNs", type: "uint64" },
      { name: "orderType", type: "uint8" },
      { name: "selfMatchingOption", type: "uint8" },
      { name: "builder", type: "address" },
      { name: "builderFeeBpsTimes1k", type: "uint96" },
    ],
    outputs: [
      { name: "success", type: "bool" },
      { name: "orderId", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "getAutoPullRequirement",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "isBid", type: "bool" },
      { name: "price", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "builderFeeBpsTimes1k", type: "uint96" },
    ],
    outputs: [
      { name: "inputToken", type: "address" },
      { name: "requiredAmount", type: "uint256" },
      { name: "delta", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getPoolParams",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "baseToken_", type: "address" },
      { name: "quoteToken_", type: "address" },
      { name: "makerFeeBpsTimes1k_", type: "uint256" },
      { name: "takerFeeBpsTimes1k_", type: "uint256" },
      { name: "tickSize_", type: "uint256" },
      { name: "minQuantity_", type: "uint256" },
      { name: "lotSize_", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "isOperatorAuthorized",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getBookLevels",
    stateMutability: "view",
    inputs: [
      { name: "isBid", type: "bool" },
      { name: "numLevels", type: "uint64" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "price", type: "uint256" },
          { name: "quantity", type: "uint256" },
        ],
      },
    ],
  },
  { type: "error", name: "PostOnlyWouldCross", inputs: [] },
  { type: "error", name: "OnlyApprovedContracts", inputs: [] },
  {
    type: "error",
    name: "InsufficientBalance",
    inputs: [
      { name: "available", type: "uint256" },
      { name: "required", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "InvalidPrice",
    inputs: [
      { name: "price", type: "uint256" },
      { name: "tickSize", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "InvalidQuantity",
    inputs: [
      { name: "quantity", type: "uint256" },
      { name: "constraint", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "QuantityBelowMinimum",
    inputs: [
      { name: "quantity", type: "uint256" },
      { name: "minimum", type: "uint256" },
    ],
  },
  { type: "error", name: "InvalidAmount", inputs: [] },
  { type: "error", name: "PriceTooLarge", inputs: [] },
  { type: "error", name: "InvalidTakerSide", inputs: [] },
  { type: "error", name: "ZeroQuoteFillsAllowed", inputs: [] },
  { type: "error", name: "FillOrKillNotFillable", inputs: [] },
  {
    type: "error",
    name: "InsufficientGasForPayout",
    inputs: [{ name: "gasLeft", type: "uint256" }],
  },
  {
    type: "error",
    name: "InvalidMsgValue",
    inputs: [
      { name: "expected", type: "uint256" },
      { name: "received", type: "uint256" },
    ],
  },
  { type: "error", name: "UseDepositNative", inputs: [] },
  { type: "error", name: "UnexpectedNativeDeposit", inputs: [] },
  { type: "error", name: "BuilderCodesNotSupported", inputs: [] },
  { type: "error", name: "InvalidBuilder", inputs: [] },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "error",
    name: "ERC20InsufficientBalance",
    inputs: [
      { name: "sender", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC20InsufficientAllowance",
    inputs: [
      { name: "spender", type: "address" },
      { name: "allowance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
] as const;

export const NATIVE_TOKEN = "0x28f34DeFd2b4CB48d9eE6d89f2Be4Bc601694c00" as const satisfies Address;
export const ORDER_TYPE_POST_ONLY = 3;
export const NATIVE_BUY_GAS = BigInt(5_000_000);
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const satisfies Address;
