import type { Metadata } from "next";
import { OrchardPage } from "@/components/desk/OrchardPage";

export const metadata: Metadata = {
  title: "Orchard — Classified fruit badges",
  description: "Full DreamDesk leaderboard: every soulbound fruit badge, ranked by on-chain score.",
};

export default function Orchard() {
  return <OrchardPage />;
}
