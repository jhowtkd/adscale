export const OUTPUT_ANNOTATION_MAX_COUNT = 5;
export const OUTPUT_ANNOTATION_COMMENT_MAX_LENGTH = 300;

export type OutputAnnotation = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
  status: "draft";
};

function checked(annotations: readonly OutputAnnotation[]) {
  if (annotations.length < 1 || annotations.length > OUTPUT_ANNOTATION_MAX_COUNT) throw new Error("annotation_count");
  return annotations.map((annotation) => {
    const comment = annotation.comment.trim();
    if (!comment || comment.length > OUTPUT_ANNOTATION_COMMENT_MAX_LENGTH) throw new Error("annotation_comment");
    const bounds = [annotation.x, annotation.y, annotation.width, annotation.height];
    if (!bounds.every(Number.isFinite) || annotation.x < 0 || annotation.y < 0 || annotation.width <= 0 || annotation.height <= 0 || annotation.x + annotation.width > 1 || annotation.y + annotation.height > 1) throw new Error("annotation_bounds");
    return { ...annotation, comment };
  });
}

export function compileOutputAnnotationInstruction(annotations: readonly OutputAnnotation[], generalComment?: string) {
  const general = generalComment?.trim() ?? "";
  if (general.length > OUTPUT_ANNOTATION_COMMENT_MAX_LENGTH) throw new Error("annotation_comment");
  if (!general && annotations.length === 0) throw new Error("annotation_count");
  const lines = annotations.length > 0 ? checked(annotations).map((annotation, index) => `${index + 1}. ${annotation.comment}`) : [];
  return [
    lines.length > 0 && general
      ? "Aplique o feedback geral e as alterações numeradas na imagem anotada."
      : lines.length > 0 ? "Aplique somente as alterações numeradas na imagem anotada." : "Aplique somente a alteração solicitada.",
    "Mantenha os demais elementos da arte.",
    "",
    ...(general ? [general] : []),
    ...(general && lines.length > 0 ? [""] : []),
    ...lines,
  ].join("\n");
}

export function drawOutputAnnotations(context: CanvasRenderingContext2D, width: number, height: number, annotations: readonly OutputAnnotation[]) {
  const items = checked(annotations);
  const scale = Math.min(width, height);
  const lineWidth = Math.max(3, Math.round(scale * 0.004));
  const radius = Math.max(12, Math.round(scale * 0.018));
  items.forEach((annotation, index) => {
    const x = annotation.x * width;
    const y = annotation.y * height;
    const boxWidth = annotation.width * width;
    const boxHeight = annotation.height * height;
    const badgeX = Math.min(width - radius, x + boxWidth);
    const badgeY = Math.max(radius, y);
    context.save();
    context.strokeStyle = "#facc15";
    context.lineWidth = lineWidth;
    context.strokeRect(x, y, boxWidth, boxHeight);
    context.fillStyle = "#facc15";
    context.beginPath();
    context.arc(badgeX, badgeY, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#111827";
    context.font = `700 ${radius}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index + 1), badgeX, badgeY);
    context.restore();
  });
}

export async function renderAnnotatedOutputFile(input: { outputId: string; imageUrl: string; annotations: readonly OutputAnnotation[] }) {
  const response = await fetch(input.imageUrl, { credentials: "include" });
  if (!response.ok) throw new Error("annotation_source_download");
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("annotation_canvas_context");
    context.drawImage(bitmap, 0, 0);
    drawOutputAnnotations(context, bitmap.width, bitmap.height, input.annotations);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("annotation_png")), "image/png"));
    return new File([blob], `output-${input.outputId.replace(/[^a-zA-Z0-9_-]/g, "")}-annotations.png`, { type: "image/png" });
  } finally {
    bitmap.close();
  }
}
