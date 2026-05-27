"use client";

/**
 * Resize an image before upload to reduce file size and speed up AI analysis.
 * Target: 1024px on the longest side, maintaining aspect ratio.
 */
export async function resizeImageForUpload(
  file: File,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<Blob> {
  const { maxDimension = 1024, quality = 0.85 } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // If image is already small enough, return original
      if (width <= maxDimension && height <= maxDimension) {
        resolve(file);
        return;
      }

      // Calculate new dimensions maintaining aspect ratio
      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const outputQuality = file.type === "image/png" ? undefined : quality;

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create blob from canvas"));
          }
        },
        outputType,
        outputQuality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for resizing"));
    };

    img.src = url;
  });
}

/**
 * Check if a file needs resizing based on dimensions or file size.
 */
export function shouldResizeImage(file: File, maxFileSizeMB = 5): boolean {
  return file.size > maxFileSizeMB * 1024 * 1024;
}
