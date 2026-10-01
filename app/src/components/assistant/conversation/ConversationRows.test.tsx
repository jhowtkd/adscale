import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";
import en from "../../../../messages/en.json";
import { MessageTime, StrategistRow, StrategistText, UserBubble } from "./ConversationRows";

const wrap = (ui: React.ReactNode, locale: "pt-BR" | "en" = "pt-BR") => (
  <NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? ptBR : en}>{ui}</NextIntlClientProvider>
);

describe("MessageTime", () => {
  it("renders a <time> with the ISO value and the hour and minute in the reader's language", () => {
    render(wrap(<MessageTime at="2026-09-30T10:02:45.000Z" />));
    const time = screen.getByText("10:02");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-09-30T10:02:45.000Z");
  });

  it("accepts a Date and formats it in English", () => {
    render(wrap(<MessageTime at={new Date("2026-09-30T15:30:00.000Z")} />, "en"));
    expect(screen.getByText(/3:30\s?PM/)).toBeInTheDocument();
  });

  it("renders nothing for a live message with no time, or an invalid one", () => {
    const { container, rerender } = render(wrap(<MessageTime at={undefined} />));
    expect(container).toBeEmptyDOMElement();
    rerender(wrap(<MessageTime at="not a date" />));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("StrategistRow", () => {
  it("shows the name, the IA badge and the time, with the content under the name", () => {
    render(wrap(<StrategistRow at="2026-09-30T10:02:00.000Z"><p>Olá</p></StrategistRow>));
    const row = screen.getByTestId("strategist-row");
    expect(row).toHaveTextContent("Estrategista");
    expect(row).toHaveTextContent("IA");
    expect(row).toHaveTextContent("10:02");
    expect(screen.getByText("Olá")).toBeInTheDocument();
  });

  it("shares one header across consecutive messages: with showHeader off only the content remains", () => {
    render(wrap(<StrategistRow showHeader={false} at="2026-09-30T10:02:00.000Z"><p>Continuação</p></StrategistRow>));
    const row = screen.getByTestId("strategist-row");
    expect(row).not.toHaveTextContent("Estrategista");
    expect(row).not.toHaveTextContent("10:02");
    expect(screen.getByText("Continuação")).toBeInTheDocument();
  });

  it("never says Equipe", () => {
    render(wrap(<StrategistRow><p>x</p></StrategistRow>));
    expect(screen.getByTestId("strategist-row").textContent).not.toMatch(/\bEquipe\b/);
  });
});

describe("StrategistText and UserBubble", () => {
  it("tag the Strategist's line as an assistant message, keeping its line breaks", () => {
    render(wrap(<StrategistText>linha</StrategistText>));
    expect(screen.getByTestId("assistant-message-assistant")).toHaveClass("whitespace-pre-wrap");
  });

  it("right-aligns the person's bubble and puts the time under the text", () => {
    render(wrap(<UserBubble at="2026-09-30T10:03:00.000Z">Oi, tudo bem?</UserBubble>));
    const bubble = screen.getByTestId("assistant-message-user");
    expect(bubble).toHaveClass("ml-auto");
    expect(bubble).toHaveTextContent("Oi, tudo bem?");
    expect(bubble).toHaveTextContent("10:03");
  });

  it("shows a bubble without a time while the message is live", () => {
    render(wrap(<UserBubble>ao vivo</UserBubble>));
    expect(screen.getByTestId("assistant-message-user").querySelector("time")).toBeNull();
  });
});
