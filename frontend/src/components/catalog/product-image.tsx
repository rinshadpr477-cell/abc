'use client';

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Product image with a consistent frame (fixed ratio, object-cover) and a placeholder for
 * products without an image or whose URL fails to load. Colours come from theme tokens, so it
 * reads correctly in light and dark mode. A plain <img> is used on purpose: image URLs are
 * arbitrary external hosts, which next/image would require to be allow-listed.
 */
export function ProductImage({
  src,
  alt,
  className,
  iconClassName,
  showLabel = false,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
  showLabel?: boolean;
}) {
  // Remember WHICH url failed, so changing the url automatically retries without an effect.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = !!src && failedSrc !== src;

  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden bg-muted/60', className)}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div role="img" aria-label={src ? `${alt} (image unavailable)` : `${alt} (no image)`} className="flex flex-col items-center gap-1 text-muted-foreground/50">
          <ImageOff className={cn('size-8', iconClassName)} />
          {showLabel && <span className="text-xs">{src ? 'Image unavailable' : 'No image'}</span>}
        </div>
      )}
    </div>
  );
}
