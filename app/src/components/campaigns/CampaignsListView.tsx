"use client";

import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
} from "@/components/ui/table";
import CampaignTableRow from "./CampaignTableRow";
import CampaignListCard from "./CampaignListCard";
import type { Campaign } from "@/lib/mock-data";
import { useTranslations } from "next-intl";
import { StaggerContainer, StaggerItem } from "@/components/animations/StaggerContainer";

interface CampaignsListViewProps {
  campaigns: Campaign[];
  selectedIds: Set<string>;
  allSelected: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveAsTemplate: (campaign: Campaign) => void;
}

export default function CampaignsListView({
  campaigns,
  selectedIds,
  allSelected,
  onToggleSelect,
  onToggleSelectAll,
  onDuplicate,
  onArchive,
  onDelete,
  onSaveAsTemplate,
}: CampaignsListViewProps) {
  const tc = useTranslations("common");

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 z-20">
              <tr className="border-b border-[var(--border-dim)] bg-[var(--surface-raised)]">
                <TableHead className="w-[44px] px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all campaigns"
                    checked={allSelected}
                    onChange={(e) => onToggleSelectAll(e.target.checked)}
                    className={cn(
                      "size-[18px] rounded-sm border border-[var(--border-medium)] appearance-none cursor-pointer",
                      "checked:bg-[var(--accent-green)] checked:border-[var(--accent-green)]",
                      "indeterminate:bg-[var(--accent-green)] indeterminate:border-[var(--accent-green)]",
                      "transition-colors duration-150"
                    )}
                    style={
                      allSelected
                        ? {
                            backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%20%2001%200%201.414l-5%205a1%201%20%200%2001-1.414%200l-2-2a1%201%20%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%20%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E")`,
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                          }
                        : selectedIds.size > 0
                          ? {
                              backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%3E%3Cpath%20d%3D%22M3%208h10v1H3z%22%2F%3E%3C%2Fsvg%3E")`,
                              backgroundRepeat: "no-repeat",
                              backgroundPosition: "center",
                              backgroundColor: "var(--accent-green)",
                            }
                          : {}
                    }
                  />
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] px-4 py-3">
                  {tc("campaign")}
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] px-4 py-3 w-[140px]">
                  {tc("platforms")}
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] px-4 py-3 w-[120px]">
                  {tc("status")}
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] px-4 py-3 w-[100px]">
                  {tc("variations")}
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] px-4 py-3 w-[100px] hidden md:table-cell">
                  {tc("credits")}
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] px-4 py-3 w-[140px]">
                  {tc("modified")}
                </TableHead>
                <TableHead className="w-[56px] px-4 py-3" />
              </tr>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign, index) => (
                <CampaignTableRow
                  key={campaign.id}
                  campaign={campaign}
                  index={index}
                  selected={selectedIds.has(campaign.id)}
                  onSelect={(checked) => onToggleSelect(campaign.id, checked)}
                  onDuplicate={onDuplicate}
                  onArchive={onArchive}
                  onDelete={onDelete}
                  onSaveAsTemplate={onSaveAsTemplate}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Cards */}
      <StaggerContainer className="md:hidden space-y-3" staggerDelay={0.04}>
        {campaigns.map((campaign, index) => (
          <StaggerItem key={campaign.id}>
            <CampaignListCard
              campaign={campaign}
              index={index}
              selected={selectedIds.has(campaign.id)}
              onSelect={(checked) => onToggleSelect(campaign.id, checked)}
              onDuplicate={onDuplicate}
              onArchive={onArchive}
              onDelete={onDelete}
              onSaveAsTemplate={onSaveAsTemplate}
            />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </>
  );
}
