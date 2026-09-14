"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { VisualLanguage, VisualRepertoire, VisualRule } from "@/server/brand-training/visual-repertoire";

export interface VisualRepertoireReviewProps {
  value: VisualRepertoire;
  onChange: (value: VisualRepertoire) => void;
  previewById: Record<string, string>;
}

const fieldClass =
  "w-full rounded-[var(--radius-control)] border-0 bg-white/6 px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

type RuleLocation =
  | { kind: "common" }
  | { kind: "language"; languageId: string };

function locateRule(value: VisualRepertoire, ruleId: string): RuleLocation | null {
  if (value.common.some((rule) => rule.id === ruleId)) return { kind: "common" };
  const owner = value.languages.find((language) => language.rules.some((rule) => rule.id === ruleId));
  return owner ? { kind: "language", languageId: owner.id } : null;
}

/**
 * Operator review for the trained visual repertoire (plan 02, T2). Common
 * identity rules apply to every piece; named languages specialize contexts.
 * Every rule keeps its supporting evidence thumbnails — a rule whose evidence
 * is unavailable cannot be silently confirmed.
 */
export function VisualRepertoireReview({ value, onChange, previewById }: VisualRepertoireReviewProps) {
  const t = useTranslations("brandTraining");
  const [draftLanguageName, setDraftLanguageName] = useState("");

  const updateRule = (ruleId: string, patch: Partial<VisualRule>) => {
    onChange({
      ...value,
      common: value.common.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
      languages: value.languages.map((language) => ({
        ...language,
        rules: language.rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
      })),
    });
  };

  const removeRule = (ruleId: string) => {
    onChange({
      ...value,
      common: value.common.filter((rule) => rule.id !== ruleId),
      languages: value.languages.map((language) => ({
        ...language,
        rules: language.rules.filter((rule) => rule.id !== ruleId),
      })),
    });
  };

  const moveRule = (ruleId: string, target: string) => {
    const location = locateRule(value, ruleId);
    if (!location) return;
    const sourceRules = location.kind === "common"
      ? value.common
      : (value.languages.find((language) => language.id === location.languageId)?.rules ?? []);
    const rule = sourceRules.find((candidate) => candidate.id === ruleId);
    if (!rule) return;
    const without = {
      ...value,
      common: value.common.filter((candidate) => candidate.id !== ruleId),
      languages: value.languages.map((language) => ({
        ...language,
        rules: language.rules.filter((candidate) => candidate.id !== ruleId),
      })),
    };
    if (target === "common") {
      onChange({ ...without, common: [...without.common, rule] });
      return;
    }
    onChange({
      ...without,
      languages: without.languages.map((language) =>
        language.id === target ? { ...language, rules: [...language.rules, rule] } : language,
      ),
    });
  };

  const updateLanguage = (languageId: string, patch: Partial<VisualLanguage>) => {
    onChange({
      ...value,
      languages: value.languages.map((language) =>
        language.id === languageId ? { ...language, ...patch } : language,
      ),
    });
  };

  const removeLanguage = (languageId: string) => {
    onChange({ ...value, languages: value.languages.filter((language) => language.id !== languageId) });
  };

  const addLanguage = () => {
    const name = draftLanguageName.trim();
    if (!name) return;
    onChange({
      ...value,
      languages: [
        ...value.languages,
        { id: crypto.randomUUID(), name, contexts: [], rules: [] },
      ],
    });
    setDraftLanguageName("");
  };

  const renderRule = (rule: VisualRule) => (
    <li
      key={rule.id}
      data-testid={`repertoire-rule-${rule.id}`}
      className="space-y-2 rounded-[var(--radius-card)] bg-white/4 p-3"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {rule.dimension} · {rule.confidence}
      </p>
      <p className="text-sm text-[var(--text-primary)]">{rule.observation}</p>
      <ul className="flex flex-wrap gap-2">
        {rule.evidenceIds.map((evidenceId) => {
          const preview = previewById[evidenceId];
          return (
            <li key={evidenceId}>
              <figure>
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt={t("repertoire.evidenceAlt")} className="h-16 w-16 rounded object-cover" />
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">{t("repertoire.evidenceUnavailable")}</span>
                )}
                <figcaption className="max-w-32 truncate text-[11px] text-[var(--text-muted)]">
                  {rule.observation}
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
      <label className="block space-y-1 text-xs text-[var(--text-secondary)]">
        <span>{t("repertoire.application")}</span>
        <textarea
          aria-label={t("repertoire.application")}
          value={rule.application}
          onChange={(event) => updateRule(rule.id, { application: event.target.value })}
          rows={2}
          className={fieldClass}
        />
      </label>
      <label className="block space-y-1 text-xs text-[var(--text-secondary)]">
        <span>{t("repertoire.avoid")}</span>
        <textarea
          aria-label={t("repertoire.avoid")}
          value={rule.avoid}
          onChange={(event) => updateRule(rule.id, { avoid: event.target.value })}
          rows={2}
          className={fieldClass}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span>{t("repertoire.moveTo")}</span>
          <select
            aria-label={t("repertoire.moveTo")}
            value={locateRule(value, rule.id)?.kind === "language"
              ? (locateRule(value, rule.id) as { languageId: string }).languageId
              : "common"}
            onChange={(event) => moveRule(rule.id, event.target.value)}
            className="rounded-[var(--radius-control)] bg-white/6 px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            <option value="common">{t("repertoire.commonOption")}</option>
            {value.languages.map((language) => (
              <option key={language.id} value={language.id}>
                {language.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => removeRule(rule.id)}
          className="rounded px-2 py-1 text-xs text-[var(--danger-text)]"
        >
          {t("repertoire.removeRule")}
        </button>
      </div>
    </li>
  );

  return (
    <div data-testid="visual-repertoire-review" className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">{t("repertoire.explanation")}</p>
      {value.common.length === 0 && value.languages.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">{t("repertoire.empty")}</p>
      ) : null}

      <section aria-label={t("repertoire.commonTitle")} className="space-y-2">
        <h4 className="text-xs font-medium tracking-wide text-[var(--text-secondary)]">
          {t("repertoire.commonTitle")}
        </h4>
        <ul className="space-y-3">{value.common.map(renderRule)}</ul>
      </section>

      <section aria-label={t("repertoire.languagesTitle")} className="space-y-3">
        <h4 className="text-xs font-medium tracking-wide text-[var(--text-secondary)]">
          {t("repertoire.languagesTitle")}
        </h4>
        <ul className="space-y-3">
          {value.languages.map((language) => (
            <li
              key={language.id}
              data-testid={`repertoire-language-${language.id}`}
              className="space-y-2 rounded-[var(--radius-card)] bg-white/2 p-3"
            >
              <label className="block space-y-1 text-xs text-[var(--text-secondary)]">
                <span>{t("repertoire.name")}</span>
                <input
                  aria-label={t("repertoire.name")}
                  value={language.name}
                  onChange={(event) => updateLanguage(language.id, { name: event.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className="block space-y-1 text-xs text-[var(--text-secondary)]">
                <span>{t("repertoire.contexts")}</span>
                <input
                  aria-label={t("repertoire.contexts")}
                  value={language.contexts.join(", ")}
                  placeholder={t("repertoire.contextsPlaceholder")}
                  onChange={(event) =>
                    updateLanguage(language.id, {
                      contexts: event.target.value.split(",").map((entry) => entry.trim()).filter(Boolean),
                    })
                  }
                  className={fieldClass}
                />
              </label>
              <ul className="space-y-3">{language.rules.map(renderRule)}</ul>
              <button
                type="button"
                onClick={() => removeLanguage(language.id)}
                className="rounded px-2 py-1 text-xs text-[var(--danger-text)]"
              >
                {t("repertoire.removeLanguage")}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2">
          <label className="block flex-1 space-y-1 text-xs text-[var(--text-secondary)]">
            <span>{t("repertoire.newLanguageName")}</span>
            <input
              aria-label={t("repertoire.newLanguageName")}
              value={draftLanguageName}
              onChange={(event) => setDraftLanguageName(event.target.value)}
              className={fieldClass}
            />
          </label>
          <button
            type="button"
            onClick={addLanguage}
            disabled={!draftLanguageName.trim()}
            className="rounded-[var(--radius-control)] bg-white/8 px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-50"
          >
            {t("repertoire.addLanguage")}
          </button>
        </div>
      </section>
    </div>
  );
}
