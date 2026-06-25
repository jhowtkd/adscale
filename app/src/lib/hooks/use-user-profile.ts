import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface UserProfileResponse {
  firstName: string;
  lastName: string;
  email: string;
  bio: string;
  timezone: string;
  avatarUrl: string | null;
}

export type UpdateUserProfilePayload = Partial<
  Pick<UserProfileResponse, "firstName" | "lastName" | "bio" | "timezone">
>;

async function fetchUserProfile(): Promise<UserProfileResponse> {
  const res = await apiFetch("/api/user/profile");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load profile");
  }
  return res.json();
}

async function updateUserProfile(
  payload: UpdateUserProfilePayload
): Promise<UserProfileResponse> {
  const res = await apiFetch("/api/user/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save profile");
  }
  return res.json();
}

async function uploadProfileAvatar(file: File): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiFetch("/api/user/profile/avatar", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to upload avatar");
  }
  return res.json();
}

function getUserProfileQueryKey() {
  return ["user-profile"];
}

export function useUserProfile() {
  return useQuery({
    queryKey: getUserProfileQueryKey(),
    queryFn: fetchUserProfile,
    staleTime: STALE_TIME.STATIC,
  });
}

export function useUpdateUserProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateUserProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getUserProfileQueryKey() });
    },
  });
}

export function useUploadProfileAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadProfileAvatar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getUserProfileQueryKey() });
    },
  });
}
