import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import ptBR from "../../../messages/pt-BR.json";

function leafStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(leafStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(leafStrings);
  }
  return [];
}

describe("email communication copy", () => {
  it("keeps PT-BR and EN transactional email keys in parity", () => {
    const ptKeys = Object.keys(ptBR.transactionalEmails);
    const enKeys = Object.keys(en.transactionalEmails);
    expect(ptKeys.sort()).toEqual(enKeys.sort());
    expect(Object.keys(ptBR.transactionalEmails.welcome).sort()).toEqual(
      Object.keys(en.transactionalEmails.welcome).sort()
    );
    expect(Object.keys(ptBR.transactionalEmails.eyebrows).sort()).toEqual(
      Object.keys(en.transactionalEmails.eyebrows).sort()
    );
  });

  it("does not use retired cockpit or 14-day trial language", () => {
    const copy = [
      ...leafStrings(ptBR.transactionalEmails),
      ...leafStrings(ptBR.notifications),
      ...leafStrings(en.transactionalEmails),
      ...leafStrings(en.notifications),
    ].join("\n");

    expect(copy).not.toMatch(/cockpit/i);
    expect(copy).not.toMatch(/14 dias/i);
    expect(copy).not.toMatch(/14 days/i);
    expect(copy).toMatch(/Estúdio|Studio/);
    expect(copy).toMatch(/Jhonatan/);
  });

  it("keeps founder voice in subjects and primary CTAs", () => {
    expect(ptBR.transactionalEmails.verification.subject).toBe("Falta um clique");
    expect(ptBR.transactionalEmails.verification.cta).toBe("Sou eu. Liberar");
    expect(ptBR.transactionalEmails.welcome.subject).toBe("Entrou. Agora gera.");
    expect(ptBR.transactionalEmails.welcome.title).toBe("O Estúdio tá aberto");
    expect(ptBR.notifications.lowCreditsSubject).toBe("Crédito no osso");
    expect(en.transactionalEmails.welcome.subject).toBe("You're in. Now generate.");
  });

  it("keeps welcome subjects within the 50-character convention", () => {
    expect(ptBR.transactionalEmails.welcome.subject.length).toBeLessThanOrEqual(50);
    expect(en.transactionalEmails.welcome.subject.length).toBeLessThanOrEqual(50);
    expect(ptBR.transactionalEmails.verification.subject.length).toBeLessThanOrEqual(50);
    expect(ptBR.notifications.lowCreditsSubject.length).toBeLessThanOrEqual(50);
    expect(ptBR.notifications.derivationCompleteSubject.length).toBeLessThanOrEqual(50);
  });
});
