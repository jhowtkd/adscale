import { EXAMPLES, INTENTS, escapeHtml } from './guest-core.mjs';
import { iconMarkup as icon } from './icons.mjs';

/** Only controlled copy and escaped asset paths enter this template. User input never does. */
export function renderShell(assetBase = '/adscale-guest', resolveAsset, options = {}) {
  const attachmentsEnabled = options.attachmentsEnabled === true;
  const asset = (name) => escapeHtml(resolveAsset ? resolveAsset(name) : `${assetBase.replace(/\/$/, '')}/${name}`);
  const attachGroup = attachmentsEnabled
    ? `<div class="ag-attach-group"><input class="ag-sr" id="ag-file-input" type="file" accept="image/png,image/jpeg,image/webp" multiple tabindex="-1" aria-label="Selecionar referências"/><button type="button" class="ag-attach" data-action="attach">${icon('paperclip',14)}Anexar</button><span class="ag-file-hint">Até 3 imagens</span></div>`
    : `<p class="ag-attach-off">Referências podem ser adicionadas depois, no Estúdio.</p>`;
  const nav = [
    ['home','Estúdio','focus','is-active'],['grid','Explorar exemplos','gallery',''],
    ['book','Como funciona','how',''],['tag','Sua marca','brand',''],
  ].map(([name,label,action,active]) => `<button type="button" class="ag-nav-item ${active}" data-action="${action}"${active ? ' aria-current="page"' : ''}>${icon(name,19)}<span>${label}</span></button>`).join('');
  const intents = INTENTS.map((item) => `<button type="button" class="ag-intent" data-action="intent" data-intent="${item.id}" aria-pressed="${item.id === 'single'}"><span class="ag-intent-icon ${item.tone}">${icon(item.icon,19)}</span><span><span class="ag-intent-label">${item.label}</span><span class="ag-intent-desc">${item.description}</span></span></button>`).join('');
  const examples = EXAMPLES.slice(0,3).map((example) => `<article class="ag-example-card"><button type="button" class="ag-example-thumb" data-action="example" data-example="${example.id}" aria-label="Ver exemplo: ${escapeHtml(example.title)}"><img src="${asset(example.image)}" alt="${escapeHtml(example.alt)}" width="210" height="150" loading="lazy"/><span class="ag-thumb-hover">${icon('eye',26)}</span></button><div class="ag-example-text"><h3>${example.title}</h3><p>${example.description}</p><button type="button" class="ag-card-action" data-action="use-example" data-example="${example.id}">${example.action}${icon('arrow',14)}</button></div></article>`).join('');
  const steps = [
    ['piece','1. Descreva','Conte o que você precisa e adicione referências.'],
    ['sparkle','2. Gere','Entre no estúdio e dê forma à sua ideia.'],
    ['edit','3. Ajuste','Revise a criação e refine os detalhes.'],
    ['export','4. Use','Baixe sua peça e continue criando.'],
  ].map(([symbol,title,text],index) => `<div class="ag-step"><span class="ag-step-icon">${icon(symbol,22)}</span><div><h3>${title}</h3><p>${text}</p></div>${index < 3 ? `<span class="ag-step-arrow">${icon('arrow',14)}</span>`:''}</div>`).join('');
  return `<a class="ag-skip" href="#ag-request">Ir para o pedido</a>
  <aside class="ag-sidebar" aria-label="Navegação principal">
    <a class="ag-logo" href="/hi" aria-label="Adscale, início" data-action="focus"><img src="${asset('logo.svg')}" alt="Adscale" width="132" height="23"/></a>
    <nav class="ag-nav">${nav}</nav>
    <button type="button" class="ag-side-brand" data-action="brand"><span class="ag-pill">BRAND CORTEX</span><strong>Treine sua marca ${icon('chevron',14)}</strong><p>O contexto que orienta cada criação.</p></button>
    <div class="ag-side-bottom"><p class="ag-side-note">Um espaço para as ideias que ainda não saíram do papel.</p><button type="button" class="ag-nav-item" data-action="help">${icon('help',18)}<span>Precisa de uma mão?</span></button><div class="ag-visitor"><span class="ag-visitor-icon">${icon('eye',16)}</span><div><strong>Explorando o Adscale</strong><small>MODO VISITANTE</small></div></div><button type="button" class="ag-nav-item" data-action="auth">${icon('login',18)}<span>Entrar no estúdio</span></button></div>
  </aside>
  <main class="ag-main" id="main">
    <header class="ag-topbar"><button type="button" class="ag-icon-button ag-mobile-menu" data-action="menu" aria-label="Abrir menu">${icon('menu',19)}</button><a class="ag-logo ag-logo-small" href="/hi" data-action="focus" aria-label="Adscale, início"><img src="${asset('logo.svg')}" alt="Adscale" width="114" height="20"/></a><span class="ag-crumb">ESTÚDIO · MODO VISITANTE</span><div class="ag-top-actions"><button type="button" class="ag-icon-button" data-action="gallery" aria-label="Pesquisar exemplos">${icon('search',17)}</button><button type="button" class="ag-top-button ag-new-request" data-action="new">${icon('plus',16)}Novo pedido</button><button type="button" class="ag-top-button" data-action="auth">Entrar ${icon('arrow',14)}</button><button type="button" class="ag-icon-button ag-help-button" data-action="help" aria-label="Ajuda">${icon('help',17)}</button></div></header>
    <section class="ag-hero" aria-labelledby="ag-title"><div class="ag-hero-content"><p class="ag-eyebrow">SEU PRÓXIMO TRABALHO COMEÇA AQUI</p><h1 id="ag-title">O que vamos criar<br/>para a sua marca?</h1><p class="ag-lead">Descreva sua ideia ou escolha um exemplo.<br/>Comece por aqui e continue no estúdio.</p>
      <form class="ag-composer" id="ag-composer" novalidate aria-label="Começar uma criação"><label class="ag-field-label" for="ag-request">Descreva o que você precisa criar</label><textarea id="ag-request" name="request" maxlength="4000" rows="3" aria-describedby="ag-assurance ag-form-error" placeholder="Ex.: quero um anúncio para divulgar o lançamento da minha marca, com uma imagem marcante e pouco texto."></textarea><div id="ag-example-tag" class="ag-example-tag" hidden></div><div id="ag-files" class="ag-file-list" role="group" aria-label="Referências anexadas"></div><div class="ag-composer-actions">${attachGroup}<button type="button" class="ag-primary" data-action="continue">Continuar ${icon('arrow',16)}</button></div><p id="ag-form-error" class="ag-form-error" role="alert" hidden></p></form>
      <div class="ag-intents" role="group" aria-label="Tipo de criação">${intents}</div><p class="ag-assurance" id="ag-assurance">${icon('shield',13)}Explore sem conta. Entre para gerar e salvar suas criações.</p><div class="ag-resume-banner" id="ag-resume-banner" hidden></div>
    </div><div class="ag-hero-art"><img src="${asset('hero-collage.webp')}" alt="Estudos visuais de campanhas: esporte, produto e café, com diferentes estilos de composição" width="668" height="430" fetchpriority="high"/><p class="ag-art-label">Estudos visuais · exemplos ilustrativos</p></div></section>
    <section class="ag-examples" id="ag-examples" aria-labelledby="ag-examples-title"><div class="ag-section-heading"><div><h2 id="ag-examples-title">Você não precisa começar do zero.</h2><p class="ag-section-subtitle">Escolha um ponto de partida e transforme em algo da sua marca.</p></div><button type="button" class="ag-text-button" data-action="gallery">Ver mais exemplos ${icon('arrow',15)}</button></div><div class="ag-example-grid">${examples}</div></section>
    <section class="ag-how" id="ag-how" aria-labelledby="ag-how-title"><h2 id="ag-how-title">Como funciona</h2><p class="ag-section-subtitle">Da ideia à criação, sem complicação.</p><div class="ag-steps">${steps}</div></section>
    <section class="ag-bottom-cta" aria-labelledby="ag-bottom-title"><div><h2 id="ag-bottom-title">Pronto para levar suas ideias mais longe?</h2><p>Seu próximo projeto pode começar com uma frase.</p></div><button type="button" class="ag-primary" data-action="auth">Entrar no estúdio ${icon('arrow',17)}</button></section>
    <footer class="ag-footer"><span>Adscale. Um estúdio para as suas ideias.</span><div class="ag-footer-links"><a href="/privacy" data-action="privacy">Privacidade</a><a href="/terms" data-action="terms">Termos de uso</a><button type="button" data-action="help">Ajuda</button></div></footer>
  </main><dialog class="ag-dialog" id="ag-dialog" aria-labelledby="ag-dialog-title"></dialog><div id="ag-toast" class="ag-toast" role="status" aria-live="polite" hidden></div>`;
}
