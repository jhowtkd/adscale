// splitLeakedToolCall: a tool call the provider handed back as text (ticket 15, item 1).

import { describe, expect, it } from "vitest";
import { splitLeakedToolCall } from "./leaked-tool-call";

const invoke = (name: string, params: Record<string, string>) =>
  `<invoke name="${name}">${Object.entries(params).map(([key, value]) => `<parameter name="${key}">${value}</parameter>`).join("")}</invoke>`;

describe("splitLeakedToolCall", () => {
  it.each([
    ["plain text", "Sua marca vende café."],
    ["stray angle brackets", "Vendas < 10 e > 5, ver <b>destaque</b> e a<b."],
    ["an empty string", ""],
    ["a tag that only looks alike", "<invokes>nada</invokes> <parameter name=\"x\">y</parameter>"],
  ])("leaves %s untouched and finds no call", (_name, text) => {
    expect(splitLeakedToolCall(text)).toEqual({ text });
  });

  it("cuts a call at the end and reads its name and arguments", () => {
    const result = splitLeakedToolCall(`Resposta.\n\n${invoke("sugerir_proximos_passos", { resposta: "Resposta.", itens: '["a","b","c"]' })}`);
    expect(result).toEqual({ text: "Resposta.", call: { name: "sugerir_proximos_passos", args: { resposta: "Resposta.", itens: ["a", "b", "c"] } } });
  });

  it("markup in the MIDDLE of the text is taken out, text before and after kept, and no call is given", () => {
    expect(splitLeakedToolCall(`Antes. ${invoke("oferecer_plano", {})} Depois.`)).toEqual({ text: "Antes.  Depois." });
  });

  it.each(["", "   ", "\n\n", " \n "])("markup followed only by %j closes the text: the call is given", (tail) => {
    expect(splitLeakedToolCall(`Fim. ${invoke("oferecer_plano", {})}${tail}`)).toEqual({ text: "Fim.", call: { name: "oferecer_plano", args: {} } });
  });

  it("markup followed by any text is not a closing call", () => {
    const result = splitLeakedToolCall(`Fim. ${invoke("sugerir_proximos_passos", { resposta: "x" })} e mais.`);
    expect(result).toEqual({ text: "Fim.  e mais." });
  });

  it.each(["<invoke-widget>x</invoke-widget>", "<invokes>nada</invokes>", "Use <invoke-widget> e <invokes> aqui."])("%s is not markup: the text is intact", (text) => {
    expect(splitLeakedToolCall(text)).toEqual({ text });
  });

  it.each(["<function_calls>", "<function_calls>", "<invoke>", "<invoke>"])("a bare %s opens markup", (opener) => {
    expect(splitLeakedToolCall(`Oi ${opener} resto sem fechar`)).toEqual({ text: "Oi" });
  });

  it("a loose <function_calls> with no closer cuts from the opener on, whatever follows", () => {
    expect(splitLeakedToolCall("Texto antes. <function_calls> e tudo isso some")).toEqual({ text: "Texto antes." });
  });

  it.each([
    ["without a namespace", (inner: string) => `<function_calls>${inner}</function_calls>`, ""],
    ["with the antml: namespace", (inner: string) => `<function_calls>${inner.replace(/<(\/?)(invoke|parameter)/g, "<$1antml:$2")}</function_calls>`, ""],
  ])("reads the function_calls wrapper %s", (_name, wrap) => {
    const result = splitLeakedToolCall(`Oi.\n${wrap(invoke("sugerir_proximos_passos", { resposta: "Oi.", itens: '["x"]' }))}`);
    expect(result).toEqual({ text: "Oi.", call: { name: "sugerir_proximos_passos", args: { resposta: "Oi.", itens: ["x"] } } });
    expect(result.text).not.toMatch(/[<>]/);
  });

  it("reads a valid JSON object parameter as a value, and a broken list as the string it is", () => {
    expect(splitLeakedToolCall(invoke("propose_plan", { content: '{"goals":["x"]}' })).call?.args).toEqual({ content: { goals: ["x"] } });
    expect(splitLeakedToolCall(invoke("sugerir_proximos_passos", { itens: '["a"' })).call?.args).toEqual({ itens: '["a"' });
  });

  it("trims parameter values and keeps a plain bracketed sentence as text", () => {
    const result = splitLeakedToolCall(invoke("sugerir_proximos_passos", { resposta: "\n  Olá, tudo bem?\n", itens: "[nota] não é JSON" }));
    expect(result.call?.args).toEqual({ resposta: "Olá, tudo bem?", itens: "[nota] não é JSON" });
  });

  it("a call cut off without any closer: everything from the opener on goes away", () => {
    const result = splitLeakedToolCall('Resposta curta.\n<invoke name="sugerir_proximos_passos"><parameter name="resposta">Resposta cur');
    expect(result.text).toBe("Resposta curta.");
    expect(result.call).toEqual({ name: "sugerir_proximos_passos", args: {} });
  });

  it("a cut-off opener with no readable name has no call, and the markup still goes", () => {
    expect(splitLeakedToolCall('Texto.\n<invoke name=')).toEqual({ text: "Texto." });
  });

  it("with two calls none is read, and the markup from the first opener to the last closer is cut", () => {
    const result = splitLeakedToolCall(`A. ${invoke("oferecer_plano", {})}\n${invoke("sugerir_proximos_passos", { resposta: "B" })}`);
    expect(result).toEqual({ text: "A." });
    expect(result.call).toBeUndefined();
  });

  it("a quotation with no closer plus the real call at the end are two openers: no call, text = what comes before the first", () => {
    const result = splitLeakedToolCall(`O site traz <invoke name="x"> sem fechar.\n\n${invoke("sugerir_proximos_passos", { resposta: "Real." })}`);
    expect(result).toEqual({ text: "O site traz" });
  });

  it("a single opener inside the <function_calls> wrapper is read", () => {
    const result = splitLeakedToolCall(`Oi.\n<function_calls>${invoke("sugerir_proximos_passos", { resposta: "Oi." })}</function_calls>`);
    expect(result).toEqual({ text: "Oi.", call: { name: "sugerir_proximos_passos", args: { resposta: "Oi." } } });
  });

  it("<invoke-widget> and <invokes> do not count as openers: the real call at the end is still read", () => {
    const result = splitLeakedToolCall(`Use <invoke-widget> e <invokes> no site.\n${invoke("oferecer_plano", {})}`);
    expect(result).toEqual({ text: "Use <invoke-widget> e <invokes> no site.", call: { name: "oferecer_plano", args: {} } });
  });

  it("two openers with the antml: namespace count the same", () => {
    const one = '<invoke name="oferecer_plano"></invoke>';
    expect(splitLeakedToolCall(`X ${one}${one}`).call).toBeUndefined();
    expect(splitLeakedToolCall(`X ${one}`).call).toEqual({ name: "oferecer_plano", args: {} });
  });

  it("a call without a name is cut from the text and gives no call", () => {
    expect(splitLeakedToolCall('Oi. <invoke><parameter name="resposta">x</parameter></invoke>')).toEqual({ text: "Oi." });
  });

  it("tolerates spaces around `=` and inside the tag", () => {
    const result = splitLeakedToolCall('Oi. <invoke   name = "sugerir_proximos_passos" ><parameter name = "resposta" >Oi.</parameter></invoke>');
    expect(result).toEqual({ text: "Oi.", call: { name: "sugerir_proximos_passos", args: { resposta: "Oi." } } });
  });

  it("is case-insensitive about the tags", () => {
    const result = splitLeakedToolCall('Oi. <INVOKE name="oferecer_plano"></INVOKE>');
    expect(result).toEqual({ text: "Oi.", call: { name: "oferecer_plano", args: {} } });
  });

  it.each([
    ["single quotes on the invoke and the parameter", `Oi. <invoke name='sugerir_proximos_passos'><parameter name='resposta'>Oi.</parameter><parameter name='itens'>["a"]</parameter></invoke>`],
    ["double quotes on the invoke, single on the parameter", `Oi. <invoke name="sugerir_proximos_passos"><parameter name='resposta'>Oi.</parameter><parameter name='itens'>["a"]</parameter></invoke>`],
    ["single quotes on the invoke, double on the parameter", `Oi. <invoke name='sugerir_proximos_passos'><parameter name="resposta">Oi.</parameter><parameter name="itens">["a"]</parameter></invoke>`],
    ["single quotes with spaces around `=`", `Oi. <invoke  name = 'sugerir_proximos_passos' ><parameter name = 'resposta' >Oi.</parameter><parameter name='itens'>["a"]</parameter></invoke>`],
  ])("reads %s", (_name, text) => {
    expect(splitLeakedToolCall(text)).toEqual({ text: "Oi.", call: { name: "sugerir_proximos_passos", args: { resposta: "Oi.", itens: ["a"] } } });
  });

  it("reads a value that holds both kinds of quote in full", () => {
    const value = `Não é "isso"; é 'aquilo'`;
    expect(splitLeakedToolCall(`<invoke name="sugerir_proximos_passos"><parameter name="resposta">${value}</parameter></invoke>`).call?.args).toEqual({ resposta: value });
    expect(splitLeakedToolCall(`<invoke name='sugerir_proximos_passos'><parameter name='resposta'>${value}</parameter></invoke>`).call?.args).toEqual({ resposta: value });
  });

  it.each(['["a"]', '{"k":1}', '[1] Ponto um'])("`resposta` is always a string, even when it reads as JSON: %s", (value) => {
    expect(splitLeakedToolCall(invoke("sugerir_proximos_passos", { resposta: value })).call?.args).toEqual({ resposta: value });
  });

  it("the other parameters still become JSON values", () => {
    expect(splitLeakedToolCall(invoke("sugerir_proximos_passos", { resposta: "Oi", itens: '["x"]' })).call?.args).toEqual({ resposta: "Oi", itens: ["x"] });
    expect(splitLeakedToolCall(invoke("propose_plan", { content: '{"k":1}' })).call?.args).toEqual({ content: { k: 1 } });
  });

  it("the text of a markup-only message is empty", () => {
    expect(splitLeakedToolCall(invoke("oferecer_plano", {})).text).toBe("");
  });
});
