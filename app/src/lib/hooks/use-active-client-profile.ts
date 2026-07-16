"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import {
  useClientProfiles,
  type ClientProfile,
} from "@/lib/hooks/use-client-profiles";

export type ActiveClientProfileState = {
  profiles: ClientProfile[];
  activeProfile: ClientProfile | null;
  activeClientProfileId: string | null;
  requiresSelection: boolean;
  isLoading: boolean;
  selectProfile: (profileId: string) => void;
};

export function useActiveClientProfile(): ActiveClientProfileState {
  const { data: profiles = [], isLoading } = useClientProfiles();
  const persistedId = useAppStore((state) => state.activeClientProfileId);
  const selectProfile = useAppStore((state) => state.setActiveClientProfileId);
  const validPersistedId = profiles.some((profile) => profile.id === persistedId)
    ? persistedId
    : null;
  const activeClientProfileId =
    profiles.length === 1 ? profiles[0].id : validPersistedId;

  useEffect(() => {
    if (isLoading || persistedId === activeClientProfileId) return;
    selectProfile(activeClientProfileId);
  }, [activeClientProfileId, isLoading, persistedId, selectProfile]);

  return {
    profiles,
    activeProfile:
      profiles.find((profile) => profile.id === activeClientProfileId) ?? null,
    activeClientProfileId,
    requiresSelection: !isLoading && profiles.length > 1 && !activeClientProfileId,
    isLoading,
    selectProfile,
  };
}
