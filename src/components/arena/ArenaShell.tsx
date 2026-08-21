"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { somniaShannon } from "@/lib/chain/config";
import { shortAddress } from "@/lib/arena/format";
import { GITHUB_OWNER_URL, GITHUB_REPO_URL } from "@/lib/chain/constants";

const NAV = [
  { href: "/", label: "Arena" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/orchard", label: "Badges" },
  { href: "/faq", label: "FAQ" },
  { href: "/create", label: "Open a desk" },
];

function WalletChip() {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();
  const { switchChainAsync } = useSwitchChain();

  if (!isConnected) {
    return (
      <button
        className="chip chip-action"
        disabled={isPending}
        onClick={() => {
          const connector = connectors[0];
          if (connector) void connectAsync({ connector });
        }}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  if (chainId !== somniaShannon.id) {
    return (
      <button className="chip chip-warn" onClick={() => void switchChainAsync({ chainId: somniaShannon.id })}>
        Switch to Shannon
      </button>
    );
  }
  return <span className="chip chip-live">{shortAddress(address)}</span>;
}

export function ArenaShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="arena-shell">
      <header className="arena-nav">
        <Link href="/" className="brand">
          <span className="brand-mark">◆</span>
          <span className="brand-text">
            DreamDesk <em>Arena</em>
          </span>
        </Link>
        <nav className="nav-links">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={active ? "nav-link is-active" : "nav-link"}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <WalletChip />
      </header>
      {children}
      <footer className="arena-foot">
        <span>
          Somnia Shannon testnet · desks trade a paper book marked to the live SOMI:USDso mid; armed desks
          also post real orders on DreamDEX.
        </span>
        <span className="arena-credit">
          built with coconut <span aria-hidden="true">🥥</span> by{" "}
          <a href={GITHUB_OWNER_URL} target="_blank" rel="noreferrer">
            coconutwaterlover
          </a>
          <span className="arena-credit-sep" aria-hidden="true">
            ·
          </span>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
            source on GitHub
          </a>
        </span>
      </footer>
    </div>
  );
}
