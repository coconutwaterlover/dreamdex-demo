"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { boardToVoters, useDeskBadges } from "@/hooks/useDeskBadges";
import { isChainConfigured } from "@/lib/chain/constants";
import { cloneSeedVoters } from "@/lib/desk/round";
import { FruitGarnish } from "./FruitGarnish";
import { Leaderboard } from "./Leaderboard";
import "./desk.css";

export function OrchardPage() {
  const chainEnabled = isChainConfigured();
  const { address } = useAccount();
  const badges = useDeskBadges(chainEnabled, address);
  const voters = chainEnabled
    ? boardToVoters(badges.rows, address, [], [])
    : cloneSeedVoters();

  return (
    <>
      <FruitGarnish />
      <main className="shell orchard-shell">
        <header className="hero rise">
          <div>
            <p className="eyebrow">dreamDEX · fruit stall</p>
            <h1>Orchard</h1>
            <p className="pitch">
              Every soulbound fruit badge, ranked by on-chain score. The stall shows the first
              ten classified — this is the rest of the harvest.
            </p>
          </div>
          <div className="hero-actions">
            <Link href="/" className="ghost">
              Back to the stall
            </Link>
          </div>
        </header>
        {badges.loading ? (
          <p className="board-empty rise">Picking fruit…</p>
        ) : (
          <Leaderboard voters={voters} youId={address} live={chainEnabled} />
        )}
      </main>
    </>
  );
}
