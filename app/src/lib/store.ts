// ============================================
// ADScale - Zustand Store (UI-only)
// ============================================

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ============================================
// Toast Types
// ============================================

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

// ============================================
// Sub-state Types
// ============================================

interface UserState {
  firstName: string;
  lastName: string;
  email: string;
  credits: number;
}

interface BillingState {
  planName: string;
  billingCycle: string;
  planPrice: string;
  renewalDate: string;
  features: string[];
  creditsUsed: number;
  creditsTotal: number;
}

interface PaymentMethodState {
  last4: string;
  expiryMonth: string;
  expiryYear: string;
}

interface UsageRecord {
  id: string;
  date: string;
  description: string;
  creditsUsed: number;
  balance: number;
}

// ============================================
// Store State
// ============================================

interface AppState {
  // UI state
  sidebarCollapsed: boolean;
  currentPageTitle: string;
  toasts: Toast[];
  user: UserState;
  billing: BillingState;
  paymentMethod: PaymentMethodState;
  usageHistory: UsageRecord[];

  // Actions - UI
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCurrentPageTitle: (title: string) => void;
  addToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

// ============================================
// Store Factory
// ============================================

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // ---- Initial state ----
      sidebarCollapsed: false,
      currentPageTitle: "Dashboard",
      toasts: [],
      user: {
        firstName: "User",
        lastName: "Name",
        email: "user@example.com",
        credits: 0,
      },
      billing: {
        planName: "Starter",
        billingCycle: "Monthly",
        planPrice: "$49",
        renewalDate: "Mar 14, 2025",
        features: [
          "50 image derivations/mo",
          "Basic analytics",
          "Email support",
        ],
        creditsUsed: 0,
        creditsTotal: 500,
      },
      paymentMethod: {
        last4: "4242",
        expiryMonth: "12",
        expiryYear: "26",
      },
      usageHistory: [],

      // ---- UI Actions ----
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),

      setCurrentPageTitle: (title) =>
        set({ currentPageTitle: title }),

      addToast: (type, message) => {
        const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
        // Auto-dismiss after 5s
        setTimeout(() => {
          set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
          }));
        }, 5000);
      },

      removeToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),
    }),
    {
      name: "adscale-storage",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
