"use client";

import { useCallback, useEffect, type MutableRefObject, type RefObject } from "react";
import {
  announcementDetailFromEvent,
  broadcastCreativeAnnouncement,
  clearStoredCreativeAnnouncement,
  CREATIVE_ANNOUNCEMENT_EVENT,
  readStoredCreativeAnnouncement,
} from "./composer-announce";

export function useComposerAnnouncements({
  mountedRef,
  composerRef,
  focusComposer,
  didFocusComposerRef,
  focusFrameRef,
  setAnnouncement,
}: {
  mountedRef: MutableRefObject<boolean>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  focusComposer: boolean;
  didFocusComposerRef: MutableRefObject<boolean>;
  focusFrameRef: MutableRefObject<number | null>;
  setAnnouncement: (value: string) => void;
}) {
  useEffect(() => {
    const receiveAnnouncement = (event: Event) => {
      const message = announcementDetailFromEvent(event);
      if (!message) return;
      setAnnouncement(message);
      clearStoredCreativeAnnouncement();
    };
    window.addEventListener(CREATIVE_ANNOUNCEMENT_EVENT, receiveAnnouncement);
    const pending = readStoredCreativeAnnouncement();
    if (pending) receiveAnnouncement(new CustomEvent(CREATIVE_ANNOUNCEMENT_EVENT, { detail: pending }));
    return () => window.removeEventListener(CREATIVE_ANNOUNCEMENT_EVENT, receiveAnnouncement);
  }, [setAnnouncement]);

  const announce = useCallback((message: string) => {
    if (mountedRef.current) setAnnouncement(message);
    broadcastCreativeAnnouncement(message);
  }, [mountedRef, setAnnouncement]);

  useEffect(() => {
    if (!focusComposer || didFocusComposerRef.current || focusFrameRef.current !== null) return;
    const frame = window.requestAnimationFrame(() => {
      focusFrameRef.current = null;
      const composer = composerRef.current;
      if (!composer) return;
      composer.focus();
      didFocusComposerRef.current = true;
    });
    focusFrameRef.current = frame;
  }, [composerRef, didFocusComposerRef, focusComposer, focusFrameRef]);

  return { announce };
}
