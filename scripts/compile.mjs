import { compile } from "./lib/compile.mjs";

const targets = [
  ["DeskArena.sol", "DeskArena"],
  ["ArenaBadge.sol", "ArenaBadge"],
  ["ArenaClock.sol", "ArenaClock"],
];

for (const [file, name] of targets) {
  const { abi, bytecode } = compile(file, name);
  const size = (bytecode.length - 2) / 2;
  const limit = 24576;
  const flag = size > limit ? "OVER EIP-170 LIMIT" : "ok";
  console.log(
    `${name.padEnd(14)} ${String(size).padStart(6)} bytes  ${abi.length} abi entries  ${flag}`,
  );
}
