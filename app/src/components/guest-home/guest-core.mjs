/** Shared by React and the offline preview. No browser globals at import time. */
export const MAX_REQUEST_LENGTH = 4000;
export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const DRAFT_TTL = 24 * 60 * 60 * 1000;
export const INTENTS = [
  { id: 'single', label: 'Criar uma peça', short: 'Peça única', description: 'A partir da sua ideia', icon: 'piece', tone: 'purple' },
  { id: 'variations', label: 'Criar variações', short: 'Variações', description: 'Explore novas versões', icon: 'variations', tone: 'cyan' },
  { id: 'format_adaptation', label: 'Adaptar um formato', short: 'Adaptar formato', description: 'Leve para outros canais', icon: 'formats', tone: 'amber' },
];
export const EXAMPLES = [
  { id: 'product', title: 'Da foto ao anúncio', category: 'Produto', description: 'Transforme uma imagem em uma peça com a sua marca.', action: 'Usar este exemplo', intent: 'single', image: 'example-product.webp', alt: 'Estudo ilustrativo de produto cosmético sobre pedra, com folhagens e sombras naturais', prompt: 'Quero um anúncio para apresentar um produto da minha marca. Destaque a embalagem, use uma chamada curta e uma composição limpa. Vou adicionar a foto do produto como referência no estúdio.' },
  { id: 'variations', title: 'Uma ideia, diferentes versões', category: 'Beleza', description: 'Explore outros ângulos sem perder a sua identidade.', action: 'Criar minhas variações', intent: 'variations', image: 'example-variations.webp', alt: 'Estudo ilustrativo de campanha de beleza com diferentes composições', prompt: 'Crie variações da minha peça de beleza, mantendo a identidade da marca. Explore novos enquadramentos, chamadas e composições. Quero comparar as versões antes de escolher.' },
  { id: 'formats', title: 'A mesma ideia, outros formatos', category: 'Design', description: 'Adapte sua criação para feed, stories e novos espaços.', action: 'Adaptar minha criação', intent: 'format_adaptation', image: 'example-formats.webp', alt: 'Estudo ilustrativo de coleção de design em formatos diferentes', prompt: 'Adapte a minha peça de lançamento para feed quadrado e stories. Preserve o conceito, a identidade e a legibilidade. Reorganize os elementos para cada formato, sem apenas recortar a imagem.' },
  { id: 'sport', title: 'Uma marca em movimento', category: 'Esporte', description: 'Uma direção visual forte para a sua próxima campanha.', action: 'Usar este exemplo', intent: 'single', image: 'poster-runclub.webp', alt: 'Estudo ilustrativo de anúncio esportivo com retrato em fundo escuro', prompt: 'Crie uma peça para uma marca esportiva. Quero um retrato forte, fundo escuro, contraste bem definido e uma chamada curta sobre evolução. A composição deve ser sóbria, sem excesso de elementos.' },
  { id: 'coffee', title: 'Ideias que merecem uma pausa', category: 'Café', description: 'Produto e tipografia em uma composição editorial.', action: 'Usar este exemplo', intent: 'single', image: 'poster-moka.webp', alt: 'Estudo ilustrativo de marca de café com caneca verde e fundo claro', prompt: 'Crie uma peça para uma marca de café. Use composição editorial, fundo claro, tipografia elegante e o produto em destaque. O tom deve ser acolhedor e a mensagem, curta.' },
];
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
/** Metadata alone is never a file: uploads require real bytes (File or Blob). */
function hasFileBytes(file) {
  return file instanceof Blob
    || (file != null && typeof file.arrayBuffer === 'function' && typeof file.size === 'number');
}
export function getExample(id) { return EXAMPLES.find((item) => item.id === id) ?? null; }
export function getIntent(id) { return INTENTS.find((item) => item.id === id) ?? INTENTS[0]; }
export function validateRequest(request) {
  if (typeof request !== 'string' || !request.trim()) return 'Conte um pouco sobre o que você quer criar.';
  if (request.length > MAX_REQUEST_LENGTH) return `Seu pedido pode ter até ${MAX_REQUEST_LENGTH} caracteres.`;
  return null;
}
/** Files stay on the device until the user explicitly continues in the authenticated studio. */
export function selectFiles(existing, incoming) {
  const files = [...existing]; const errors = [];
  for (const file of Array.from(incoming)) {
    if (!hasFileBytes(file)) { errors.push(`${file?.name ?? 'arquivo'}: referência inválida.`); continue; }
    if (!VALID_TYPES.has(file.type)) { errors.push(`${file.name}: use uma imagem PNG, JPG ou WebP.`); continue; }
    if (file.size > MAX_FILE_BYTES || file.size <= 0) { errors.push(`${file.name}: o limite é 10 MB por imagem.`); continue; }
    if (files.some((previous) => previous.name === file.name && previous.size === file.size && previous.lastModified === file.lastModified)) continue;
    if (files.length >= MAX_FILES) { errors.push('Você pode adicionar até 3 referências.'); break; }
    files.push(file);
  }
  return { files, errors };
}
export function createDraft(input, id, now = Date.now()) {
  const problem = validateRequest(input.request);
  if (problem) throw new Error(problem);
  if (!UUID_PATTERN.test(id)) throw new Error('Identificador de pedido inválido.');
  if (!INTENTS.some((item) => item.id === input.intent)) throw new Error('Tipo de criação inválido.');
  const { files, errors } = selectFiles([], input.files ?? []);
  if (errors.length) throw new Error(errors.join(' '));
  return { version: 1, id, request: input.request.trim(), intent: input.intent,
    exampleId: getExample(input.exampleId)?.id ?? null, files, createdAt: now, expiresAt: now + DRAFT_TTL };
}
export function parseDraft(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || value.version !== 1 || !UUID_PATTERN.test(value.id)) return null;
  if (validateRequest(value.request) || !INTENTS.some((item) => item.id === value.intent)) return null;
  if (!Number.isFinite(value.createdAt) || !Number.isFinite(value.expiresAt)
    || value.createdAt > now + 60000 || value.expiresAt <= now
    || value.expiresAt !== value.createdAt + DRAFT_TTL) return null;
  if (!Array.isArray(value.files) || value.files.length > MAX_FILES) return null;
  if (value.files.some((file) => !hasFileBytes(file) || !VALID_TYPES.has(file.type) || typeof file.name !== 'string' || !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES)) return null;
  if (value.exampleId != null && !getExample(value.exampleId)) return null;
  return value;
}
export function buildResumePath(id, intent) {
  if (!UUID_PATTERN.test(id) || !INTENTS.some((item) => item.id === intent)) throw new Error('Pedido de continuação inválido.');
  return '/?' + new URLSearchParams({ compose: '1', fresh: '1', intent, guestDraft: id });
}
export function formatFileSize(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`; }
export function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }

/** Works on HTTPS/localhost and in standalone local previews. */
export function newDraftId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
