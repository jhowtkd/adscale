'use client';

import { useEffect, useMemo, useRef } from 'react';
import { sanitizePublicGuestEvent } from '@/lib/guest-home/events';
import { mountGuestHome, type GuestHomeOptions } from './guest-controller.mjs';
import { renderShell } from './guest-markup.mjs';
import './guest-home.css';

export type AdscaleGuestHomeProps = Pick<GuestHomeOptions, 'assetBase' | 'preview' | 'attachmentsEnabled' | 'onContinue' | 'onEvent'>;

/**
 * An SSR-friendly client island. Markup, styling and controller are shared with
 * the standalone preview, not independently duplicated implementations.
 *
 * renderShell only interpolates controlled copy and escaped asset paths.
 * User input is never rendered unescaped or executed as HTML.
 * Mount one instance per page. Keep assetBase/preview stable during editing.
 */
export default function AdscaleGuestHome({
  assetBase = '/adscale-guest', preview = false, attachmentsEnabled = false, onContinue, onEvent,
}: AdscaleGuestHomeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onContinue, onEvent });
  const markup = useMemo(() => renderShell(assetBase, undefined, { attachmentsEnabled }), [assetBase, attachmentsEnabled]);

  useEffect(() => { callbacks.current = { onContinue, onEvent }; }, [onContinue, onEvent]);
  useEffect(() => {
    if (!rootRef.current) return;
    const home = mountGuestHome(rootRef.current, {
      assetBase,
      preview,
      attachmentsEnabled,
      // Public events stay on this callback until an approved collector with
      // consent exists. Everything forwarded is allowlisted first; unknown
      // events are dropped, never sent anywhere.
      onEvent: (event) => {
        const clean = sanitizePublicGuestEvent({
          name: event.name,
          detail: { ...event.detail },
        });
        if (clean) callbacks.current.onEvent?.(clean);
      },
      onContinue: async (draft, path) => {
        const handler = callbacks.current.onContinue;
        if (handler) await handler(draft, path);
        else window.location.assign(path);
      },
    });
    return () => home.destroy();
  }, [assetBase, preview, attachmentsEnabled, markup]);

  return <div ref={rootRef} className="adscale-guest" dangerouslySetInnerHTML={{ __html: markup }} />;
}
