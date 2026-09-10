import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * M02 first Studio piece: empty occupancy stays centered even if the
 * inspiration catalog has items. Começar starts a single piece without a
 * reference. Deterministic seed only; interview stays off.
 */

const FIXTURE_PATH = process.env.CREATE_POST_E2E_FIXTURE_PATH
  ? path.resolve(process.env.CREATE_POST_E2E_FIXTURE_PATH)
  : path.resolve(__dirname, "../fixtures/create-post-e2e.json");

type Fixture = {
  email: string;
  password: string;
  readyWorkId: string;
  firstVisit: { email: string; password: string };
};

function fixture(): Fixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error("Missing fixture. Run npm run seed:create-post-e2e first.");
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
}

async function signInHome(page: import("@playwright/test").Page, data: { email: string; password: string }) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "adscale_cookie_consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false }),
    );
  });
  const signIn = await page.request.post("/api/auth/sign-in/email", {
    data: { email: data.email, password: data.password },
  });
  expect(signIn.ok(), await signIn.text()).toBe(true);
}

test.describe("First studio piece (M02)", () => {
  test("keeps the talk box centered on an empty home", async ({ page }) => {
    const data = fixture();
    await signInHome(page, data.firstVisit);

    await page.goto("/");
    const talkBox = page.getByTestId("studio-talk-box");
    await expect(talkBox).toBeVisible({ timeout: 60_000 });
    await expect(talkBox).toHaveAttribute("data-placement", "center");
    await expect(talkBox.getByRole("radiogroup")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /começar|gerar|start|generate/i })).toBeVisible();
  });

  test("keeps protocol settings reachable after a work is open", async ({ page }) => {
    const data = fixture();
    await signInHome(page, data);

    await page.goto(`/?workId=${data.readyWorkId}`);
    const talkBox = page.getByTestId("studio-talk-box");
    await expect(talkBox).toBeVisible({ timeout: 60_000 });
    await expect(talkBox).toHaveAttribute("data-placement", "dock");
    await expect(talkBox.getByRole("radiogroup")).toBeVisible();
  });

  test("completes the first piece from Começar without a reference", async ({ page }) => {
    const data = fixture();
    await signInHome(page, data.firstVisit);

    await page.goto("/");
    const talkBox = page.getByTestId("studio-talk-box");
    await expect(talkBox).toBeVisible({ timeout: 60_000 });
    await expect(talkBox).toHaveAttribute("data-placement", "center");
    const request = page.locator("#creative-composer-request");
    await expect(request).toBeVisible({ timeout: 60_000 });
    const brief = "Peça de lançamento para o produto de teste.";
    // Workspace/composer hydration can remount the controlled textarea after
    // the first paint; keep writing until the value sticks.
    await expect.poll(async () => {
      await request.fill(brief);
      return request.inputValue();
    }, { timeout: 30_000 }).toBe(brief);
    await page.getByRole("button", { name: /começar|gerar|start|generate/i }).click();
    await expect(page.getByText(/anexe a peça de referência/i)).toHaveCount(0);
    await expect(talkBox).toHaveAttribute("data-placement", "dock", { timeout: 120_000 });
  });
});

type StudioWorkDetail = {
  work: { id: string };
  outputs: Array<{
    id: string; status: string; targetFormat: string; parentOutputId: string | null; isSelected: boolean;
    quality: { objectiveVerdict?: string } | null;
    reviewDraft: { instruction: string; action: string; targetFormat: string; annotations: Array<{ x: number; y: number; text: string }> } | null;
    revisionContext: { action: string; sourceOutputId: string; annotations: Array<{ text: string }> } | null;
  }>;
};
async function apiWorkDetail(page: Page, workId: string): Promise<StudioWorkDetail> {
  const response = await page.request.get(`/api/creative-work/${workId}`);
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function beginSingle(page: Page, brief: string) {
  await page.goto("/?fresh=1");
  const request = page.locator("#creative-composer-request");
  await expect(request).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => { await request.fill(brief); return request.inputValue(); }).toBe(brief);
  await page.getByRole("button", { name: /começar|start/i, exact:true }).click();
  await expect(page.getByRole("heading", { name: /revise seu plano|review your plan/i })).toBeVisible({ timeout: 120_000 });
  const workId = new URL(page.url()).searchParams.get("workId")!;
  expect(workId).toBeTruthy();
  expect((await apiWorkDetail(page,workId)).outputs).toHaveLength(0);
  await page.getByRole("button", { name: "Confirmar e gerar", exact:true }).click();
  await expect.poll(async () => (await apiWorkDetail(page,workId)).outputs[0]?.status,
    { timeout:180_000, intervals:[1_000,2_000] }).toBe("completed");
  return workId;
}
async function captureBox(page: Page, info: TestInfo, state: string) {
  const box = page.getByTestId("studio-piece-workspace");
  for (const viewport of [{width:390,height:844},{width:1045,height:586},{width:1440,height:900}]) {
    await page.setViewportSize(viewport);
    await expect(box).toBeVisible();
    const art = box.getByRole("img", {name:/peça/i}).first();
    await expect(art).toBeVisible();
    expect(await art.evaluate(image => getComputedStyle(image).objectFit)).toBe("contain");
    const rect = await art.boundingBox();
    expect(rect!.width).toBeGreaterThan(100);
    expect(rect!.height).toBeGreaterThan(100);
    await page.screenshot({ path:info.outputPath(`caixa-${viewport.width}-${state}.png`), fullPage:true, animations:"disabled" });
  }
  await page.setViewportSize({width:1440,height:900});
}
async function pieceBytes(page: Page, workId: string, outputId: string) {
  const image = await page.request.get(`/api/creative-work/${workId}/outputs/${outputId}/download`, { headers: { Accept: "*/*" } });
  expect(image.ok()).toBe(true);
  expect(["localhost","127.0.0.1","[::1]"]).toContain(new URL(image.url()).hostname);
  expect(image.headers()["content-type"]).toContain("image/png");
  const bytes = await image.body();
  return { hash:createHash("sha256").update(bytes).digest("hex"), metadata:await sharp(bytes).metadata() };
}

test.describe("integrated UI caixa", () => {
  test.beforeEach(async ({page,baseURL}) => {
    expect(process.env.E2E_CONTROLLED_PROVIDER).toBe("true");
    expect(["localhost","127.0.0.1","[::1]"]).toContain(new URL(baseURL!).hostname);
    await signInHome(page,fixture().firstVisit);
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.setViewportSize({width:1440,height:900});
  });

  test("peça, comentário, revisão, variação e formato permanecem no mesmo trabalho", async ({page},info) => {
    test.setTimeout(900_000);
    const posts:string[]=[];
    page.on("request",request => {
      if(request.method()==="POST" && /\/api\/creative-work\/[^/]+\/generate$/.test(new URL(request.url()).pathname)) posts.push(request.postData() ?? "");
    });
    const workId=await beginSingle(page,"Peça institucional para apresentar a mentoria de teste.");
    const parent=(await apiWorkDetail(page,workId)).outputs[0];
    const original=await pieceBytes(page,workId,parent.id);
    const box=page.getByTestId("studio-piece-workspace");
    await captureBox(page,info,"pronta");
    expect(posts).toHaveLength(1);
    await box.getByRole("button",{name:"Comentar",exact:true}).click();
    const add=box.getByRole("button",{name:"Adicionar comentário",exact:true});
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(box.getByRole("spinbutton",{name:"X (%)",exact:true})).toHaveValue("50");
    await expect(box.getByRole("spinbutton",{name:"Y (%)",exact:true})).toHaveValue("50");
    await box.getByRole("textbox",{name:"Comentário",exact:true}).fill("Aumente o CTA");
    await box.getByRole("button",{name:"Salvar comentário",exact:true}).click();
    await expect.poll(async () => (await apiWorkDetail(page,workId)).outputs.find(row=>row.id===parent.id)?.reviewDraft?.annotations).toEqual([{id:expect.any(String),x:0.5,y:0.5,text:"Aumente o CTA"}]);
    await captureBox(page,info,"comentario");
    await page.reload();
    await expect(box.getByRole("button",{name:"Comentário 1",exact:true})).toBeVisible();
    // Edit the persisted first pin, then add/remove a pointer pin on the
    // rendered image bounds (object-fit letterboxing must not shift coords).
    await box.getByRole("button",{name:"Comentário 1",exact:true}).click();
    await box.getByRole("textbox",{name:"Comentário",exact:true}).fill("Aumente o CTA e preserve a cor");
    await box.getByRole("button",{name:"Salvar comentário",exact:true}).click();
    await expect.poll(async ()=>(await apiWorkDetail(page,workId)).outputs.find(row=>row.id===parent.id)?.reviewDraft?.annotations[0].text).toBe("Aumente o CTA e preserve a cor");
    const commentToggle=box.getByRole("button",{name:"Comentar",exact:true});
    if(await commentToggle.getAttribute("aria-pressed")!=="true") await commentToggle.click();
    const art=box.getByRole("img",{name:/peça/i}).first();
    const rendered=await art.evaluate(element=>{
      const image=element as HTMLImageElement;
      const rect=image.getBoundingClientRect();
      const scale=Math.min(rect.width/image.naturalWidth,rect.height/image.naturalHeight);
      const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
      return {x:rect.x+(rect.width-width)/2,y:rect.y+(rect.height-height)/2,width,height};
    });
    await page.mouse.click(rendered.x+rendered.width*0.2,rendered.y+rendered.height*0.75);
    expect(Number(await box.getByRole("spinbutton",{name:"X (%)",exact:true}).inputValue())).toBeCloseTo(20,0);
    expect(Number(await box.getByRole("spinbutton",{name:"Y (%)",exact:true}).inputValue())).toBeCloseTo(75,0);
    await box.getByRole("textbox",{name:"Comentário",exact:true}).fill("Comentário temporário no ponto da imagem");
    await box.getByRole("button",{name:"Salvar comentário",exact:true}).click();
    await expect.poll(async ()=>(await apiWorkDetail(page,workId)).outputs.find(row=>row.id===parent.id)?.reviewDraft?.annotations.length).toBe(2);
    await box.getByRole("button",{name:"Comentário 2",exact:true}).click();
    await box.getByRole("button",{name:"Remover comentário",exact:true}).click();
    await expect.poll(async ()=>(await apiWorkDetail(page,workId)).outputs.find(row=>row.id===parent.id)?.reviewDraft?.annotations.length).toBe(1);
    const instruction=box.getByRole("textbox",{name:"O que você quer mudar?",exact:true});
    await instruction.fill("Preserve a pessoa e destaque a chamada principal.");
    const format=box.getByRole("button",{name:"Adaptar formato",exact:true});
    await format.click();
    const popover=page.getByRole("dialog",{name:"Proporções disponíveis"});
    await expect(popover).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(format).toBeFocused();
    await format.click();
    await popover.getByRole("button",{name:"9:16",exact:true}).click();
    await format.click();
    await popover.getByRole("button",{name:"Cancelar adaptação",exact:true}).click();
    await expect(instruction).toHaveValue("Preserve a pessoa e destaque a chamada principal.");
    expect(posts).toHaveLength(1);

    for(const [index,action] of (["refine","variation","format"] as const).entries()) {
      // Every action starts from the original; the original remains immutable.
      await box.getByRole("button",{name:/^Versão 1 · 4:5$/i}).click();
      await instruction.fill(`Ajuste ${action}: preserve a pessoa e destaque o CTA.`);
      if(action==="variation") await box.getByRole("button",{name:"Criar variação",exact:true}).click();
      if(action==="format") {
        for(const viewport of [{width:390,height:844},{width:1045,height:586},{width:1440,height:900}]) {
          await page.setViewportSize(viewport);
          await format.click();
          const rect=await popover.boundingBox();
          expect(rect).not.toBeNull();
          expect(rect!.x).toBeGreaterThanOrEqual(0);
          expect(rect!.y).toBeGreaterThanOrEqual(0);
          expect(rect!.x+rect!.width).toBeLessThanOrEqual(viewport.width);
          expect(rect!.y+rect!.height).toBeLessThanOrEqual(viewport.height);
          await page.keyboard.press("Escape");
        }
        await format.click();
        await popover.getByRole("button",{name:"9:16",exact:true}).click();
      }
      await box.getByRole("button",{name:"Revisar",exact:true}).click();
      const confirmation=box.getByTestId("piece-review-confirmation");
      await expect(confirmation).toContainText(/crédito/i);
      expect(posts).toHaveLength(index+1);
      if(index===0) await captureBox(page,info,"plano");
      const responsePromise=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/creative-work/${workId}/generate` && response.request().method()==="POST");
      await box.getByTestId("piece-review-confirm").click();
      const response=await responsePromise;
      expect(response.status()).toBe(202);
      const childId=((await response.json()) as {output:{id:string}}).output.id;
      await expect.poll(async ()=>(await apiWorkDetail(page,workId)).outputs.find(row=>row.id===childId)?.status,{timeout:180_000}).toBe("completed");
      const detail=await apiWorkDetail(page,workId);
      const child=detail.outputs.find(row=>row.id===childId)!;
      expect(detail.outputs).toHaveLength(index+2);
      expect(child).toMatchObject({parentOutputId:parent.id,targetFormat:action==="format"?"9:16":"4:5",isSelected:false});
      expect(child.revisionContext).toMatchObject({sourceOutputId:parent.id,action,annotations:[expect.objectContaining({text:"Aumente o CTA e preserve a cor"})]});
      expect((await pieceBytes(page,workId,parent.id)).hash).toBe(original.hash);
      if(action==="format") expect((await pieceBytes(page,workId,childId)).metadata).toMatchObject({width:1080,height:1920});
      expect(new URL(page.url()).searchParams.get("workId")).toBe(workId);
    }
    await page.reload();
    expect((await apiWorkDetail(page,workId)).outputs).toHaveLength(4);
    await expect(box.getByRole("button",{name:/^Versão \d+ ·/i})).toHaveCount(4);
    expect(posts).toHaveLength(4);
    expect((await apiWorkDetail(page,workId)).outputs.every(row=>!row.isSelected)).toBe(true);
  });

  test("QA fail mantém preview e bloqueia Escolher nos três tamanhos", async ({page},info)=>{
    const workId=await beginSingle(page,"Peça [e2e:qa-fail-always] para revisar falha objetiva.");
    expect((await apiWorkDetail(page,workId)).outputs[0].quality?.objectiveVerdict).toBe("fail");
    const box=page.getByTestId("studio-piece-workspace");
    await expect(box.getByRole("button",{name:"Escolher",exact:true})).toBeDisabled();
    await captureBox(page,info,"erro-qa");
  });
});
