"use client";

import { useEffect } from "react";
import { badgeTokenHref, SHANNON_EXPLORER } from "@/lib/chain/constants";
import { fruitForToken } from "@/lib/desk/fruits";
import type { MintNotice } from "@/lib/desk/types";

export function MintModal({
  notice,
  onClose,
}: {
  notice: MintNotice | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!notice) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [notice, onClose]);

  if (!notice) return null;

  const tokenHref = notice.tokenId != null ? badgeTokenHref(notice.tokenId) : null;
  const txHref =
    notice.txHash && /^0x[a-fA-F0-9]{64}$/.test(notice.txHash)
      ? `${SHANNON_EXPLORER}/tx/${notice.txHash}`
      : null;

  const fruit = fruitForToken(notice.tokenId);

  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div
        className="modal rise"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mint-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-top">
          <h2 id="mint-title">Your fruit badge was minted</h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {fruit && (
          <img className="mint-fruit" src={fruit.src} alt={fruit.label} width={96} height={96} />
        )}
        <p>
          Soulbound DreamDesk badge for <strong>{notice.name}</strong>
          {fruit ? ` — a ${fruit.label}` : ""} is on-chain. Score starts at{" "}
          <strong>{notice.score}</strong> and updates after every round you vote. It cannot be
          transferred.
        </p>
        <ul>
          {tokenHref && (
            <li>
              <a href={tokenHref} target="_blank" rel="noreferrer">
                View token #{notice.tokenId} on Shannon
              </a>
            </li>
          )}
          {txHref && (
            <li>
              <a href={txHref} target="_blank" rel="noreferrer">
                Mint transaction
              </a>
            </li>
          )}
        </ul>
        <button type="button" className="primary modal-ok" onClick={onClose}>
          Juicy
        </button>
      </div>
    </div>
  );
}
