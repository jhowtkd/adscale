"use client";

import { useLocale, useTranslations } from "next-intl";
import type { EquipeReceiptJson, ItemDetailJson } from "@/lib/equipe/api";
import EquipeAuthor from "./EquipeAuthor";
import { formatDateTime, shortHash } from "./equipe-format";

// Version history and receipts of the open item (C6): every version with
// its author, and every immutable receipt with person, role and hash.

function ReceiptRow({ receipt }: { receipt: EquipeReceiptJson }) {
  const tActions = useTranslations("equipe.receiptActions");
  const tRoles = useTranslations("equipe.roles");
  const locale = useLocale();
  const action = tActions.has(receipt.action) ? tActions(receipt.action) : receipt.action;
  const who = receipt.personRole ?? receipt.personKind;
  const role = tRoles.has(who) ? tRoles(who) : who;
  return (
    <li
      className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--text-secondary)]"
      data-testid={`receipt-${receipt.id}`}
    >
      <span className="font-medium text-[var(--text-primary)]">{action}</span>
      <span>{role}</span>
      {receipt.objectVersion ? <span>{shortHash(receipt.objectVersion)}</span> : null}
      <span className="text-[var(--text-muted)]">{formatDateTime(receipt.createdAt, locale)}</span>
    </li>
  );
}

export default function ItemOverlayHistory({ detail }: { detail: ItemDetailJson }) {
  const t = useTranslations("equipe.item");
  const locale = useLocale();
  return (
    <>
      <details data-testid="item-overlay-history">
        <summary className="cursor-pointer text-xs font-medium text-[var(--text-secondary)]">
          {t("history", { count: detail.versions.length })}
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {detail.versions.map((version, index) => (
            <li
              key={version.versionHash}
              className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--text-secondary)]"
            >
              <span className="font-medium text-[var(--text-primary)]">v{index + 1}</span>
              <EquipeAuthor authorRole={version.authorRole} />
              <span className="text-[var(--text-muted)]">
                {formatDateTime(version.createdAt, locale)}
              </span>
              {version.versionHash === detail.item.currentVersionHash ? (
                <span className="text-[var(--text-muted)]">{t("currentVersion")}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </details>

      <div>
        <p className="text-xs font-medium text-[var(--text-secondary)]">
          {t("receipts", { count: detail.receipts.length })}
        </p>
        {detail.receipts.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t("noReceipts")}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {detail.receipts.map((receipt) => (
              <ReceiptRow key={receipt.id} receipt={receipt} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
