import { apiFetch } from "@/lib/api-client";
import { STALE_TIME } from "@/lib/query-config";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface NotificationItem {
  id: string;
  userId: string;
  workspaceId: string;
  type: string;
  title: string;
  message: string;
  derivationId: string | null;
  campaignId: string | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const MAX_CLIENT_NOTIFICATIONS = 50;

export function capNotifications(items: NotificationItem[]): NotificationItem[] {
  return [...items]
    .sort((a, b) => {
      const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return byDate || b.id.localeCompare(a.id);
    })
    .slice(0, MAX_CLIENT_NOTIFICATIONS);
}

async function fetchNotifications(): Promise<NotificationItem[]> {
  const res = await apiFetch("/api/notifications?limit=50");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao carregar notificações");
  }
  const data = await res.json();
  return capNotifications(data.notifications as NotificationItem[]);
}

async function markNotificationAsRead(notificationId: string): Promise<NotificationItem> {
  const res = await apiFetch(`/api/notifications/${notificationId}/read`, {
    method: "PATCH",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao marcar como lida");
  }
  const data = await res.json();
  return data.notification as NotificationItem;
}

async function markAllNotificationsAsRead(): Promise<void> {
  const res = await apiFetch("/api/notifications", {
    method: "PATCH",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao marcar todas como lidas");
  }
}

async function clearAllNotifications(): Promise<void> {
  const res = await apiFetch("/api/notifications", {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao limpar notificações");
  }
}

export function useNotifications(options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    staleTime: STALE_TIME.DYNAMIC,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkNotificationsAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      let failed = false;
      for (let i = 0; i < ids.length; i += 4) {
        const results = await Promise.allSettled(ids.slice(i, i + 4).map(markNotificationAsRead));
        failed ||= results.some((result) => result.status === "rejected");
      }
      if (failed) throw new Error("Erro ao marcar algumas notificações como lidas");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useClearAllNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearAllNotifications,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
