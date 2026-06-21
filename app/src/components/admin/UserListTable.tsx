"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminUserSearchResult } from "@/server/repositories/admin-users";

type FilterKey =
  | "active7d"
  | "creditsZero"
  | "onboardingIncomplete"
  | "emailUnverified";

const FILTER_KEYS: FilterKey[] = [
  "active7d",
  "creditsZero",
  "onboardingIncomplete",
  "emailUnverified",
];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function UserListTable() {
  const t = useTranslations("admin.users");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchInput);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const page = Number(searchParams.get("page") ?? 1);
  const filters = useMemo(() => {
    const value: Record<FilterKey, boolean> = {
      active7d:
        searchParams.get("active7d") === "true" || searchParams.get("active") === "7d",
      creditsZero:
        searchParams.get("creditsZero") === "true" ||
        searchParams.get("credits") === "zero",
      onboardingIncomplete: searchParams.get("onboardingIncomplete") === "true",
      emailUnverified: searchParams.get("emailUnverified") === "true",
    };
    return value;
  }, [searchParams]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (page > 1) params.set("page", String(page));
    for (const key of FILTER_KEYS) {
      if (filters[key]) params.set(key, "true");
    }
    return params.toString();
  }, [debouncedSearch, filters, page]);

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      next.delete("active");
      next.delete("credits");
      router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname);
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    const currentSearch = searchParams.get("search") ?? "";
    if (debouncedSearch !== currentSearch) {
      updateParams({ search: debouncedSearch.trim() || null, page: null });
    }
  }, [debouncedSearch, searchParams, updateParams]);

  const usersQuery = useQuery({
    queryKey: ["admin", "users", queryString],
    queryFn: async (): Promise<AdminUserSearchResult> => {
      const res = await apiFetch(`/api/admin/users?${queryString}`);
      if (!res.ok) {
        throw new Error("Failed to load users");
      }
      return res.json();
    },
  });

  const totalPages = usersQuery.data
    ? Math.max(1, Math.ceil(usersQuery.data.total / usersQuery.data.pageSize))
    : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="max-w-md"
        />
        <div className="flex flex-wrap gap-2">
          {FILTER_KEYS.map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={filters[key] ? "default" : "outline"}
              onClick={() =>
                updateParams({
                  [key]: filters[key] ? null : "true",
                  page: null,
                })
              }
            >
              {t(`filters.${key}`)}
            </Button>
          ))}
        </div>
      </div>

      {usersQuery.isLoading ? (
        <p className="text-sm text-[var(--text-secondary)]">{t("loading")}</p>
      ) : usersQuery.isError || !usersQuery.data ? (
        <p className="text-sm text-[var(--text-secondary)]">{t("error")}</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.email")}</TableHead>
                <TableHead>{t("columns.workspace")}</TableHead>
                <TableHead>{t("columns.plan")}</TableHead>
                <TableHead>{t("columns.credits")}</TableHead>
                <TableHead>{t("columns.lastActivity")}</TableHead>
                <TableHead>{t("columns.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.data.users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-[var(--text-muted)]">
                    {t("empty")}
                  </TableCell>
                </TableRow>
              ) : (
                usersQuery.data.users.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link
                        href={`/admin/users/${item.id}`}
                        className="font-medium text-[var(--accent-green)] hover:underline"
                      >
                        {item.name}
                      </Link>
                    </TableCell>
                    <TableCell>{item.email}</TableCell>
                    <TableCell>
                      {item.primaryWorkspace ? (
                        <span>{item.primaryWorkspace.name}</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.primaryWorkspace?.planKey ?? (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.primaryWorkspace?.creditBalance ?? (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(item.lastActivityAt)}</TableCell>
                    <TableCell>{formatDate(item.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--text-secondary)]">
              {t("pagination.summary", {
                total: usersQuery.data.total,
                page: usersQuery.data.page,
                totalPages,
              })}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => updateParams({ page: page > 2 ? String(page - 1) : null })}
              >
                {t("pagination.previous")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => updateParams({ page: String(page + 1) })}
              >
                {t("pagination.next")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
