import type { LandingPageStructure, LandingPageSection } from "@/server/ai/landing-page";

function escapeHtml(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderSection(key: string, section: LandingPageSection): string {
  const eyebrow = section.eyebrow ? `<p class="eyebrow">${escapeHtml(section.eyebrow)}</p>` : "";
  const headline = `<h2>${escapeHtml(section.headline)}</h2>`;
  const body = section.body ? `<p>${escapeHtml(section.body)}</p>` : "";
  const bullets = section.bullets?.length
    ? `<ul>${section.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
    : "";
  const cta = section.cta ? `<a href="#" class="cta">${escapeHtml(section.cta)}</a>` : "";
  const items = section.items?.length
    ? `<dl>${section.items
        .map((item) => `<dt>${escapeHtml(item.question)}</dt><dd>${escapeHtml(item.answer)}</dd>`)
        .join("")}</dl>`
    : "";

  return `
<section id="${key}">
  <div class="container">
    ${eyebrow}
    ${headline}
    ${body}
    ${bullets}
    ${items}
    ${cta}
  </div>
</section>`;
}

export function renderLandingPageHtml(input: {
  structure: LandingPageStructure;
  imageUrl?: string | null;
}): string {
  const { structure, imageUrl } = input;
  const imageHtml = imageUrl
    ? `<div class="hero-image"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(structure.title)}" /></div>`
    : "";

  const sectionOrder: Array<keyof typeof structure.sections> = [
    "hero",
    "problem",
    "solution",
    "benefits",
    "trust",
    "offer",
    "faq",
    "finalCta",
  ];

  const heroImageSection = imageUrl
    ? `<section id="hero-image"><div class="container">${imageHtml}</div></section>`
    : "";

  const heroImageCss = imageUrl
    ? `.hero-image{margin-top:24px;text-align:center}.hero-image img{max-width:100%;height:auto;border-radius:8px}`
    : "";

  const sectionsHtml = sectionOrder
    .map((key) => renderSection(key, structure.sections[key]))
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(structure.title)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0}
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;line-height:1.6;color:#1a1a1a;background:#fff}
.container{max-width:720px;margin:0 auto;padding:24px 16px}
section{padding:48px 0}
section:nth-child(even){background:#f6f7f9}
h2{font-size:1.75rem;font-weight:700;margin-bottom:12px;line-height:1.25}
p{margin-bottom:12px}
ul{padding-left:20px;margin-bottom:12px}
li{margin-bottom:6px}
dl{margin-bottom:12px}
dt{font-weight:600;margin-top:12px}
dd{margin-left:0;color:#444}
.cta{display:inline-block;padding:12px 24px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin-top:12px}
.cta:hover{background:#0b5ed7}
.eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:.75rem;color:#0d6efd;font-weight:600;margin-bottom:8px}
${heroImageCss}
@media(min-width:640px){.container{padding:32px 24px}h2{font-size:2rem}section{padding:64px 0}}
</style>
</head>
<body>
${sectionsHtml}
${heroImageSection}
</body>
</html>`;
}
