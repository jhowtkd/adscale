"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { BrandPerson } from "@/server/brand-training/people";

export interface BrandPeopleReviewProps {
  value: BrandPerson[];
  onChange: (people: BrandPerson[]) => void;
  previewByReferenceId: Record<string, string>;
}

const fieldClass =
  "w-full rounded-[var(--radius-control)] border-0 bg-white/6 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

/**
 * Operator review for named brand people (plan 03, T1). The operator groups
 * approved `person` references, assigns the name/aliases, picks the primary
 * photo and confirms whether the photos suffice. The system never infers
 * names, roles or sensitive traits — identity comes only from this form.
 */
export function BrandPeopleReview({ value, onChange, previewByReferenceId }: BrandPeopleReviewProps) {
  const t = useTranslations("brandTraining");
  const [draftName, setDraftName] = useState("");

  const updatePerson = (id: string, patch: Partial<BrandPerson>) => {
    onChange(value.map((person) => (person.id === id ? { ...person, ...patch } : person)));
  };

  const removePerson = (id: string) => {
    onChange(value.filter((person) => person.id !== id));
  };

  const addPerson = () => {
    const name = draftName.trim();
    if (!name) return;
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        name,
        aliases: [],
        referenceIds: [],
        primaryReferenceId: "",
        preserve: [],
        referenceAdequacy: "needs_more_photos",
      } as unknown as BrandPerson,
    ]);
    setDraftName("");
  };

  return (
    <div data-testid="brand-people-review" className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">{t("people.explanation")}</p>
      {value.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">{t("people.empty")}</p>
      ) : null}
      <ul className="space-y-3">
        {value.map((person) => {
          const homonym = value.some((other) => other.id !== person.id && other.name.trim().toLocaleLowerCase("pt-BR") === person.name.trim().toLocaleLowerCase("pt-BR"));
          return (
            <li
              key={person.id}
              data-testid={`brand-person-${person.id}`}
              className="space-y-2 rounded-[var(--radius-card)] bg-white/4 p-3"
            >
              <label className="block space-y-1 text-xs text-[var(--text-secondary)]">
                <span>{t("people.name")}</span>
                <input
                  aria-label={t("people.name")}
                  value={person.name}
                  onChange={(e) => updatePerson(person.id, { name: e.target.value })}
                  className={fieldClass}
                />
              </label>
              {homonym ? (
                <p role="alert" className="text-xs text-[var(--danger-text)]">
                  {t("people.homonymWarning")}
                </p>
              ) : null}
              <label className="block space-y-1 text-xs text-[var(--text-secondary)]">
                <span>{t("people.aliases")}</span>
                <input
                  aria-label={t("people.aliases")}
                  value={person.aliases.join(", ")}
                  placeholder={t("people.aliasesPlaceholder")}
                  onChange={(e) =>
                    updatePerson(person.id, {
                      aliases: e.target.value.split(",").map((alias) => alias.trim()).filter(Boolean),
                    })
                  }
                  className={fieldClass}
                />
              </label>
              <div className="space-y-1">
                <span className="text-xs text-[var(--text-secondary)]">{t("people.photos")}</span>
                {person.referenceIds.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">{t("people.noPhotos")}</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {person.referenceIds.map((referenceId) => {
                      const preview = previewByReferenceId[referenceId];
                      const isPrimary = referenceId === person.primaryReferenceId;
                      return (
                        <li key={referenceId} className="flex items-center gap-1">
                          {preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={preview} alt={person.name} className="h-12 w-12 rounded object-cover" />
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">{referenceId.slice(0, 8)}</span>
                          )}
                          <button
                            type="button"
                            disabled={isPrimary}
                            onClick={() => updatePerson(person.id, { primaryReferenceId: referenceId })}
                            aria-label={t("people.setPrimary")}
                            aria-pressed={isPrimary}
                            className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] disabled:opacity-50"
                          >
                            {isPrimary ? t("people.primary") : t("people.setPrimary")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updatePerson(person.id, {
                                referenceIds: person.referenceIds.filter((id) => id !== referenceId),
                              })
                            }
                            aria-label={t("people.removePhoto")}
                            className="rounded px-2 py-1 text-xs text-[var(--text-secondary)]"
                          >
                            {t("people.removePhoto")}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={person.referenceAdequacy === "confirmed"}
                  onChange={(e) =>
                    updatePerson(person.id, {
                      referenceAdequacy: e.target.checked ? "confirmed" : "needs_more_photos",
                    })
                  }
                />
                <span>{t("people.adequacyConfirmed")}</span>
              </label>
              <label className="block space-y-1 text-xs text-[var(--text-secondary)]">
                <span>{t("people.preserve")}</span>
                <input
                  aria-label={t("people.preserve")}
                  value={person.preserve.join("; ")}
                  placeholder={t("people.preservePlaceholder")}
                  onChange={(e) =>
                    updatePerson(person.id, {
                      preserve: e.target.value.split(";").map((item) => item.trim()).filter(Boolean),
                    })
                  }
                  className={fieldClass}
                />
              </label>
              <button
                type="button"
                onClick={() => removePerson(person.id)}
                className="rounded px-2 py-1 text-xs text-[var(--danger-text)]"
              >
                {t("people.remove")}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-end gap-2">
        <label className="block flex-1 space-y-1 text-xs text-[var(--text-secondary)]">
          <span>{t("people.newName")}</span>
          <input
            aria-label={t("people.newName")}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className={fieldClass}
          />
        </label>
        <button
          type="button"
          onClick={addPerson}
          disabled={!draftName.trim()}
          className="rounded-[var(--radius-control)] bg-white/8 px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-50"
        >
          {t("people.add")}
        </button>
      </div>
    </div>
  );
}
