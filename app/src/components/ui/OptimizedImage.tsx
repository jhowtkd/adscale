"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageOff } from "lucide-react";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  lazy?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

export function OptimizedImage({
  src,
  alt,
  className,
  containerClassName,
  lazy = true,
  onLoad,
  onError,
}: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className={cn("flex items-center justify-center bg-muted", containerClassName)}>
        <ImageOff className="w-8 h-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("relative", containerClassName)}>
      {!isLoaded && (
        <Skeleton className="absolute inset-0" />
      )}
      <img
        src={src}
        alt={alt}
        className={cn(
          "transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0",
          className
        )}
        loading={lazy ? "lazy" : "eager"}
        decoding="async"
        onLoad={() => {
          setIsLoaded(true);
          onLoad?.();
        }}
        onError={() => {
          setHasError(true);
          onError?.();
        }}
      />
    </div>
  );
}
