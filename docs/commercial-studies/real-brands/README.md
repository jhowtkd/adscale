# Estudos comerciais com marcas reais

Laboratório editorial interno do ADScale. Nike, MTV e Absolut entram como objeto de análise, nunca como cliente, parceiro ou patrocinador.

Estudo independente produzido no ADScale. Sem afiliação, patrocínio ou aprovação da marca analisada.

## O que este kit contém

| Artefato | Função |
|---|---|
| `manifest.json` | Contrato: estudos, originais, briefs e 24 capturas |
| `nike.md`, `mtv.md`, `absolut.md` | Dossiês editoriais |
| `originals/` | Arquivos de campanha locais, fora do git |

O anúncio original entra no Brand Training. A peça gerada pela ferramenta é a prova. Fixture não substitui original nem resultado.

## Originais

Coloque os arquivos em `originals/` sem raspar um corpus. Nomes esperados:

- `nike-just-do-it-1988-print.jpg`
- `nike-walt-stack-1988-frame.jpg`
- `mtv-id-1981-a.jpg`
- `mtv-id-1981-b.jpg`
- `absolut-perfection-1980.jpg`

Enquanto os binários reais não existirem, `manifest.json` guarda o sha256 sentinela do arquivo vazio. O seed recusa até o hash bater no arquivo local.

## Capturas

15 desktop (1440×1000) e 9 mobile (390×844: treino, resultados, decisão). `waitFor` é `main`, exceto treino (`img[alt]`).

## Conta de laboratório

- Email: `estudos@example.test`
- Workspace: `ADScale — Estudos Editoriais`
- Perfis: `Estudo editorial — Nike — Just Do It`, `Estudo editorial — MTV — Network IDs`, `Estudo editorial — Absolut — Perfection`
