export function templateComposerHref(templateId: string) {
  const params = new URLSearchParams();
  params.set("templateId", templateId);
  params.set("compose", "1");
  return `/?${params.toString()}`;
}
