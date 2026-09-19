import { EXAMPLES, newDraftId, getExample, getIntent, createDraft, buildResumePath, selectFiles, validateRequest, escapeHtml, formatFileSize } from './guest-core.mjs';
import { saveDraft, loadLastDraft, removeDraft, pruneExpiredDrafts } from './guest-store.mjs';
import { iconMarkup as icon } from './icons.mjs';

/** The same controller powers the Next client island and the offline preview. */
export function mountGuestHome(root, options = {}) {
  const controller = new AbortController();
  const { signal } = controller;
  const query = (selector) => root.querySelector(selector);
  const textarea = query('#ag-request');
  const fileInput = query('#ag-file-input');
  const composer = query('#ag-composer');
  const dialog = query('#ag-dialog');
  const toast = query('#ag-toast');
  const asset = (name) => options.assetResolver?.(name) ?? `${(options.assetBase ?? '/adscale-guest').replace(/\/$/,'')}/${name}`;
  let intent = 'single', exampleId = null, files = [], urls = [];
  let destroyed = false, saving = false, draftId = null, restorable = null;
  let pendingExample = null, toastTimer, overflowBefore;
  let previewResumePath = null;
  let dragDepth = 0;
  const attachmentsEnabled = options.attachmentsEnabled === true;
  const ATTACHMENTS_OFF_MESSAGE = 'Referências estão desligadas nesta etapa. Continue com o texto e adicione imagens depois, no Estúdio.';
  // Last committed save: retry without material edits re-saves the identical
  // snapshot (same UUID and original validity); any material edit rotates to
  // a new UUID while the previous snapshot stays on disk under its own id.
  let lastSave = null;
  const fileKey = (file) => `${file.name}:${file.size}:${file.lastModified ?? 0}`;
  const snapshotSignature = () => JSON.stringify({ request: textarea.value.trim(), intent, exampleId, files: files.map(fileKey) });
  const emit = (name, detail = {}) => {
    // Never include prompt text, file names, image contents or user identifiers in telemetry.
    const event = { name, detail: { ...detail, surface: 'public_studio' } };
    root.dispatchEvent(new CustomEvent('adscale:guest', { bubbles: true, detail: event }));
    try { options.onEvent?.(event); } catch { /* Telemetry must never prevent a creation. */ }
  };
  function announce(message) {
    clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
  }
  function setError(message) {
    const element = query('#ag-form-error'); element.textContent = message ?? ''; element.hidden = !message;
    textarea.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  function focusRequest() {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof composer.scrollIntoView === 'function') composer.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
    textarea.focus({ preventScroll:true });
  }
  function renderFiles() {
    urls.forEach((url) => URL.revokeObjectURL(url)); urls = [];
    query('#ag-files').innerHTML = files.map((file, index) => {
      const url = URL.createObjectURL(file); urls.push(url);
      return `<span class="ag-file-chip"><img src="${url}" alt="" width="27" height="27"/><span title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span><small>${formatFileSize(file.size)}</small><button type="button" class="ag-remove" data-action="remove-file" data-index="${index}" aria-label="Remover ${escapeHtml(file.name)}">${icon('close',13)}</button></span>`;
    }).join('');
    const hint = query('.ag-file-hint'); if (hint) hint.textContent = files.length ? `${files.length} de 3 imagens` : 'Até 3 imagens';
  }
  function updateIntent(next) {
    intent = getIntent(next).id;
    root.querySelectorAll('[data-action="intent"]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.intent === intent)));
  }
  function updateExampleTag() {
    const example = getExample(exampleId); const tag = query('#ag-example-tag'); tag.hidden = !example;
    tag.innerHTML = example ? `${icon('sparkle',13)}Ponto de partida: ${escapeHtml(example.title)}<button type="button" data-action="clear-example" aria-label="Desvincular exemplo">${icon('close',12)}</button>` : '';
  }
  function applyExample(id) {
    const example = getExample(id); if (!example) return;
    textarea.value = example.prompt; updateIntent(example.intent); exampleId = id; updateExampleTag();
    setError(null); closeDialog(); focusRequest(); announce('Exemplo adicionado. Agora deixe o pedido com a sua cara.');
    emit('example_selected', { exampleId: id, intent });
  }
  function chooseExample(id) {
    if (!getExample(id)) return;
    const previous = getExample(exampleId);
    if (textarea.value.trim() && textarea.value !== previous?.prompt && textarea.value !== getExample(id).prompt) {
      pendingExample = id; openDialog('replace'); return;
    }
    applyExample(id);
  }
  function handleFiles(incoming) {
    if (!attachmentsEnabled) { announce(ATTACHMENTS_OFF_MESSAGE); return; }
    const result = selectFiles(files, incoming); files = result.files; renderFiles();
    if (result.errors.length) setError(result.errors.join(' '));
    else { setError(null); announce('Referências adicionadas. Elas ainda estão apenas neste navegador.'); }
    emit('references_changed', { referenceCount: files.length });
  }
  function closeDialog() { if (saving) return; if (dialog.open) { dialog.close(); document.body.style.overflow = overflowBefore ?? ''; } }
  function dialogHeader(title, subtitle='', label='') {
    return `<div class="ag-dialog-top"><div>${label ? `<p class="ag-dialog-label">${escapeHtml(label)}</p>` : ''}<h2 id="ag-dialog-title">${escapeHtml(title)}</h2>${subtitle ? `<p class="ag-dialog-intro">${escapeHtml(subtitle)}</p>` : ''}</div><button type="button" class="ag-icon-button" data-action="close" aria-label="Fechar janela">${icon('close',17)}</button></div>`;
  }
  function galleryItems(term='') {
    const normalized = term.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const matches = EXAMPLES.filter((e) => `${e.title} ${e.category} ${e.description}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(normalized));
    return matches.length ? matches.map((e) => `<button type="button" class="ag-gallery-item" data-action="example" data-example="${e.id}"><img src="${escapeHtml(asset(e.image))}" alt="${escapeHtml(e.alt)}" width="240" height="180" loading="lazy"/><strong>${e.title}</strong><small>${e.category} · ${getIntent(e.intent).short}</small></button>`).join('') : '<p class="ag-empty-search" role="status">Nenhum exemplo encontrado. Tente produto, beleza, café ou esporte.</p>';
  }
  function openDialog(kind, value) {
    if (!dialog.open) { overflowBefore = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    dialog.className = `ag-dialog${kind === 'gallery' ? ' ag-gallery' : ''}${kind === 'menu' ? ' ag-menu-dialog' : ''}`;
    let markup = '';
    if (kind === 'auth') {
      const request = textarea.value.trim();
      markup = dialogHeader(request ? 'Continue sua criação.' : 'Seu estúdio está logo ali.', 'Entre ou crie sua conta para gerar, revisar e salvar suas peças.', 'VAMOS DAR O PRÓXIMO PASSO');
      if (request) markup += `<div class="ag-summary"><div class="ag-summary-meta"><span>${getIntent(intent).short}</span><span>·</span><span>${files.length} referência${files.length === 1 ? '' : 's'}</span></div><p>${escapeHtml(request)}</p></div>`;
      markup += `<p class="ag-private-note">${icon('shield',16)}<span>${request ? 'Seu pedido e suas referências ficam disponíveis para retomada por 24 horas. Depois de entrar, continue neste mesmo navegador e dispositivo.' : 'Você escolhe sua marca e prepara o pedido dentro do estúdio.'} Nenhuma geração começa automaticamente.</span></p>${options.preview ? '<p class="ag-demo-note">Prévia local: não faz login, não envia arquivos e não consome créditos. O próximo botão demonstra a preparação do pedido.</p>' : ''}<p id="ag-dialog-error" class="ag-form-error" role="alert" hidden></p><div class="ag-dialog-actions"><button type="button" class="ag-secondary" data-action="close">Continuar explorando</button><button type="button" class="ag-primary" data-action="authenticate">${request ? 'Entrar e continuar' : 'Abrir meu estúdio'}${icon('arrow',16)}</button></div>`;
      emit('auth_prompt_opened', { intent });
    } else if (kind === 'gallery') {
      markup = dialogHeader('Um ponto de partida para a sua ideia.', 'Explore os estudos visuais. Os pedidos são editáveis; as imagens são ilustrativas.', 'EXPLORE O ESTÚDIO');
      markup += `<label class="ag-search-field">${icon('search',19)}<span class="ag-sr">Buscar exemplos</span><input id="ag-search" type="search" placeholder="Busque por produto, beleza, café…" autocomplete="off"/></label><div id="ag-gallery-grid" class="ag-gallery-grid">${galleryItems()}</div>`;
      emit('gallery_opened');
    } else if (kind === 'example') {
      const example = getExample(value); if (!example) return;
      markup = dialogHeader(example.title, example.description, `${example.category.toUpperCase()} · ESTUDO VISUAL`);
      markup += `<div class="ag-dialog-example"><img src="${escapeHtml(asset(example.image))}" alt="${escapeHtml(example.alt)}" width="210" height="210"/><div><span class="ag-example-prompt-label">Seu pedido pode começar assim:</span><p>${escapeHtml(example.prompt)}</p></div></div><p class="ag-private-note">A imagem é ilustrativa. Ao escolher este exemplo, apenas o texto do pedido e o tipo de criação são preenchidos. Adicione suas próprias referências.</p><div class="ag-dialog-actions"><button type="button" class="ag-secondary" data-action="gallery">Outros exemplos</button><button type="button" class="ag-primary" data-action="use-example" data-example="${example.id}">Usar como ponto de partida${icon('arrow',16)}</button></div>`;
    } else if (kind === 'replace') {
      markup = dialogHeader('Trocar o texto do seu pedido?', 'O exemplo vai substituir o que você escreveu. As referências anexadas serão mantidas.');
      markup += '<div class="ag-dialog-actions"><button type="button" class="ag-secondary" data-action="close">Manter meu pedido</button><button type="button" class="ag-primary" data-action="confirm-example">Usar o exemplo</button></div>';
    } else if (kind === 'new') {
      markup = dialogHeader('Começar um novo pedido?', 'O texto e os anexos desta tela serão limpos. O pedido que você salvou ao continuar também será removido deste navegador.');
      markup += '<div class="ag-dialog-actions"><button type="button" class="ag-secondary" data-action="close">Manter meu pedido</button><button type="button" class="ag-primary" data-action="confirm-new">Começar outro</button></div>';
    } else if (kind === 'restore-confirm') {
      markup = dialogHeader('Retomar o pedido salvo?', 'O texto e os anexos atuais serão substituídos pelo pedido salvo neste navegador.');
      markup += '<div class="ag-dialog-actions"><button type="button" class="ag-secondary" data-action="close">Manter o atual</button><button type="button" class="ag-primary" data-action="confirm-restore">Retomar pedido salvo</button></div>';
    } else if (kind === 'brand') {
      markup = dialogHeader('A sua marca é o ponto de partida.', 'Não uma conta de demonstração. Um espaço que será realmente seu.', 'SUA IDENTIDADE');
      markup += '<div class="ag-info-content"><p>Ao entrar no estúdio, você poderá escolher ou cadastrar sua marca e reunir as referências que orientam suas criações.</p><p>Aqui, no modo visitante, você já pode preparar o pedido. Nenhum nome de cliente, projeto ou arquivo privado é exposto nesta página.</p></div><div class="ag-dialog-actions"><button type="button" class="ag-primary" data-action="auth">Entrar no estúdio</button></div>';
    } else if (kind === 'menu') {
      markup = dialogHeader('Seu estúdio.', '', 'ADSCALE');
      markup += `<nav aria-label="Menu móvel"><button type="button" class="ag-nav-item" data-action="focus">${icon('home',19)}Começar uma criação</button><button type="button" class="ag-nav-item" data-action="gallery">${icon('grid',19)}Explorar exemplos</button><button type="button" class="ag-nav-item" data-action="how">${icon('book',19)}Como funciona</button><button type="button" class="ag-nav-item" data-action="brand">${icon('tag',19)}Sua marca</button><button type="button" class="ag-nav-item" data-action="auth">${icon('login',19)}Entrar no estúdio</button></nav>`;
    } else if (kind === 'prepared') {
      markup = dialogHeader('Seu pedido está preparado.', 'Na página integrada ao Adscale, o fluxo continua no login e no estúdio.');
      markup += `<div class="ag-summary"><p>${escapeHtml(textarea.value.trim() || 'Abrir o estúdio para começar uma criação.')}</p></div><p class="ag-demo-note">Esta é uma prévia independente. Não foi enviada nenhuma solicitação ao Adscale. Seu pedido e seus arquivos continuam apenas neste navegador.</p><div class="ag-dialog-actions"><button type="button" class="ag-secondary" data-action="copy">${icon('copy',15)} Copiar pedido</button><button type="button" class="ag-primary" data-action="close">Voltar à criação</button></div>`;
    } else {
      markup = dialogHeader(kind === 'privacy' ? 'Seus dados continuam com você.' : kind === 'terms' ? 'Esta é uma prévia de interface.' : 'Uma boa ideia já é um começo.', '', 'UM POUCO DE CONTEXTO');
      const text = kind === 'privacy' ? 'Na prévia, nenhum arquivo é enviado. Ao continuar, o pedido é salvo localmente e pode ser retomado por 24 horas. Pedidos expirados são removidos na próxima visita. A versão integrada deve apontar este link para a política de privacidade real do Adscale.' : kind === 'terms' ? 'Esta prévia demonstra a navegação e a preparação de pedidos. Ela não oferece geração de imagens ou contratação de serviços. Os termos oficiais devem permanecer na rota /terms do aplicativo.' : 'Descreva o que você quer comunicar, para quem e com qual objetivo. Você pode anexar até três imagens PNG, JPG ou WebP de até 10 MB cada. Escolha um exemplo para começar e depois adapte o pedido. Use Ctrl ou ⌘ + Enter para continuar e Esc para fechar as janelas.';
      markup += `<div class="ag-info-content"><p>${text}</p></div><div class="ag-dialog-actions"><button type="button" class="ag-primary" data-action="focus">Começar meu pedido${icon('arrow',16)}</button></div>`;
    }
    dialog.innerHTML = markup;
    if (!dialog.open) dialog.showModal();
    if (kind === 'gallery') query('#ag-search').focus();
    else dialog.querySelector('[data-action="close"]')?.focus();
  }
  async function authenticate() {
    if (saving) return;
    saving = true;
    const button = dialog.querySelector('[data-action="authenticate"]');
    if (button) { button.disabled = true; button.textContent = 'Preparando seu pedido…'; }
    let draft = null;
    try {
      let path = '/?compose=1&fresh=1';
      if (textarea.value.trim()) {
        const signature = snapshotSignature();
        if (lastSave && lastSave.signature === signature) {
          draft = lastSave.draft;
        } else {
          draftId = newDraftId();
          draft = createDraft({ request: textarea.value, intent, exampleId, files }, draftId);
        }
        await saveDraft(draft);
        lastSave = { signature, draft };
        path = buildResumePath(draft.id, intent);
      } else if (files.length) {
        throw new Error('Descreva o que você quer criar antes de continuar com as referências.');
      }
      if (destroyed) return;
      previewResumePath = path;
      emit('continue_prepared', { intent, referenceCount: files.length });
      if (options.preview) openDialog('prepared');
      else if (options.onContinue) await options.onContinue(draft, path);
      else window.location.assign(path); // Same origin: the existing proxy handles auth.
    } catch (error) {
      if (destroyed) return;
      const message = error instanceof Error ? error.message : 'Não foi possível preparar seu pedido. Tente novamente.';
      const alert = query('#ag-dialog-error');
      if (alert) {
        alert.textContent = `${message} Seu texto e seus arquivos continuam nesta tela.`;
        alert.hidden = false;
        if (!query('#ag-dialog-copy')) {
          const copy = document.createElement('button');
          copy.type = 'button'; copy.id = 'ag-dialog-copy';
          copy.className = 'ag-secondary'; copy.dataset.action = 'copy';
          copy.textContent = 'Copiar pedido';
          alert.after(copy);
        }
      }
      else announce(message);
      if (button) { button.disabled = false; button.textContent = 'Tentar continuar novamente'; }
    } finally { saving = false; if (button) button.disabled = false; }
  }
  async function clearRequest() {
    const ids = [...new Set([draftId, restorable?.id].filter(Boolean))];
    try { for (const id of ids) await removeDraft(id); }
    catch { announce('Não foi possível apagar o pedido salvo. Tente novamente.'); return; }
    if (destroyed) return;
    textarea.value = ''; files = []; exampleId = null; draftId = null; restorable = null; lastSave = null;
    renderFiles(); updateExampleTag(); updateIntent('single'); setError(null);
    query('#ag-resume-banner').hidden = true; closeDialog(); focusRequest();
    emit('new_request');
  }
  function restoreDraft() {
    if (!restorable || restorable.expiresAt <= Date.now()) { announce('O pedido salvo expirou. Comece uma nova criação.'); query('#ag-resume-banner').hidden = true; return; }
    if (restorable.files.some((file) => !(file instanceof Blob))) { announce('As referências salvas não puderam ser lidas. O pedido foi mantido para recuperação.'); return; }
    textarea.value = restorable.request; files = restorable.files; draftId = restorable.id;
    exampleId = restorable.exampleId; updateIntent(restorable.intent); renderFiles(); updateExampleTag(); setError(null);
    lastSave = { signature: snapshotSignature(), draft: restorable };
    const keptFiles = !attachmentsEnabled && restorable.files.length > 0;
    query('#ag-resume-banner').hidden = true; closeDialog(); focusRequest();
    announce(keptFiles ? 'Pedido retomado. As referências salvas foram mantidas, mas novas referências só podem ser adicionadas no Estúdio.' : 'Pedido retomado neste navegador.');
  }
  const actions = {
    focus: () => { closeDialog(); focusRequest(); },
    how: () => { closeDialog(); const how = query('#ag-how'); if (typeof how.scrollIntoView === 'function') how.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth', block:'start'}); },
    gallery: () => openDialog('gallery'), menu: () => openDialog('menu'), brand: () => openDialog('brand'), help: () => openDialog('help'),
    example: (button) => openDialog('example',button.dataset.example),
    'use-example': (button) => chooseExample(button.dataset.example),
    'confirm-example': () => { if (pendingExample) applyExample(pendingExample); pendingExample = null; },
    'clear-example': () => { exampleId = null; updateExampleTag(); },
    intent: (button) => { updateIntent(button.dataset.intent); emit('intent_selected', {intent}); },
    attach: () => { if (!attachmentsEnabled) { announce(ATTACHMENTS_OFF_MESSAGE); return; } fileInput?.click(); },
    'remove-file': (button) => { files.splice(Number(button.dataset.index),1); renderFiles(); setError(null); },
    continue: () => { const problem = validateRequest(textarea.value); if (problem) { setError(problem); focusRequest(); return; } setError(null); openDialog('auth'); },
    auth: () => openDialog('auth'), authenticate,
    close: closeDialog,
    new: () => { if (textarea.value.trim() || files.length || draftId || restorable) openDialog('new'); else clearRequest(); },
    'confirm-new': clearRequest,
    restore: () => { if (textarea.value.trim() || files.length) openDialog('restore-confirm'); else restoreDraft(); },
    'confirm-restore': restoreDraft,
    'discard-saved': async () => { try { if (restorable) await removeDraft(restorable.id); restorable = null; query('#ag-resume-banner').hidden=true; } catch { announce('Não foi possível excluir o pedido salvo. Tente novamente.'); } },
    copy: async () => {
      const text = textarea.value.trim(); if (!text) { announce('Escreva um pedido para copiar.'); return; }
      try { await navigator.clipboard.writeText(text); announce('Pedido copiado.'); }
      catch { closeDialog(); focusRequest(); textarea.select(); announce('Selecionei seu pedido. Use Ctrl ou ⌘ + C para copiar.'); }
    },
    privacy: () => { if (options.preview) openDialog('privacy'); else window.location.assign('/privacy'); },
    terms: () => { if (options.preview) openDialog('terms'); else window.location.assign('/terms'); },
  };
  root.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!button || !root.contains(button)) return;
    event.preventDefault(); if (button.disabled || saving) return;
    const action = actions[button.dataset.action]; if (action) Promise.resolve(action(button)).catch(() => announce('Não foi possível concluir essa ação. Tente novamente.'));
  }, {signal});
  composer.addEventListener('submit', (event) => { event.preventDefault(); actions.continue(); }, {signal});
  textarea.addEventListener('input', () => { if (query('#ag-form-error').textContent) setError(null); }, {signal});
  textarea.addEventListener('keydown', (event) => { if (event.isComposing) return; if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); actions.continue(); } }, {signal});
  fileInput?.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; }, {signal});
  textarea.addEventListener('paste', (event) => {
    const pasted = event.clipboardData ? Array.from(event.clipboardData.files ?? []) : [];
    if (!pasted.length) return;
    event.preventDefault();
    handleFiles(pasted);
  }, {signal});
  composer.addEventListener('dragenter', (event) => { if (!attachmentsEnabled) return; if (!event.dataTransfer?.types.includes('Files')) return; event.preventDefault(); dragDepth++; composer.classList.add('is-dragging'); }, {signal});
  composer.addEventListener('dragover', (event) => { if (!attachmentsEnabled) return; if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); }, {signal});
  composer.addEventListener('dragleave', () => { dragDepth=Math.max(0,dragDepth-1); if (!dragDepth) composer.classList.remove('is-dragging'); }, {signal});
  composer.addEventListener('drop', (event) => { event.preventDefault(); dragDepth=0; composer.classList.remove('is-dragging'); if (event.dataTransfer) handleFiles(event.dataTransfer.files); }, {signal});
  dialog.addEventListener('input', (event) => { if (event.target.id === 'ag-search') query('#ag-gallery-grid').innerHTML = galleryItems(event.target.value); }, {signal});
  dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect=dialog.getBoundingClientRect(); if (event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) closeDialog(); } }, {signal});
  // Search inputs consume Escape to clear themselves; capture it so one Escape closes the modal.
  dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!saving) closeDialog(); } }, {signal, capture:true});
  dialog.addEventListener('cancel', (event) => { if (saving) event.preventDefault(); }, {signal});
  dialog.addEventListener('close', () => { if (!dialog.open) { document.body.style.overflow = overflowBefore ?? ''; } }, {signal});
  document.addEventListener('keydown', (event) => { if ((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='k') { event.preventDefault(); if (!saving) openDialog('gallery'); } }, {signal});
  const ready = (async () => {
    try {
      await pruneExpiredDrafts();
      const last = await loadLastDraft(); if (destroyed || !last) return;
      restorable = last;
      const banner=query('#ag-resume-banner'); banner.innerHTML='Você tem um pedido salvo neste navegador.<button type="button" data-action="restore">Retomar</button><button type="button" data-action="discard-saved">Descartar</button>'; banner.hidden=false;
    } catch { /* Storage errors are surfaced on Continue, never crash public browsing. */ }
  })();
  emit('home_viewed', { preview: options.preview === true });
  return {
    ready,
    getState: () => ({ request: textarea.value, intent, exampleId, files: [...files], draftId, previewResumePath }),
    destroy: () => {
      destroyed=true; clearTimeout(toastTimer); controller.abort(); urls.forEach((url)=>URL.revokeObjectURL(url));
      if (dialog.open) { dialog.close(); document.body.style.overflow=overflowBefore ?? ''; }
    },
  };
}
