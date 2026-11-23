import { Suspense, type ReactNode } from "react";
import { Construction } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { requireOwner } from "@/lib/auth";

/** Temporary page for an admin section whose screen lands in a later part of Phase 3. */
export function AdminPlaceholder({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Admin" title={title} />
      <Suspense fallback={<div className="h-28 animate-pulse rounded-[var(--radius-card)] bg-white/70" />}>
        <OwnerOnly>
          <Card className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-orange-50">
              <Construction className="size-5 text-orange-500" aria-hidden="true" />
            </span>
            <div className="grid gap-1">
              <h2 className="text-[17px] leading-6 font-semibold text-navy-900">Coming soon</h2>
              <p className="text-[15px] leading-6 text-navy-700">{children}</p>
            </div>
          </Card>
        </OwnerOnly>
      </Suspense>
    </div>
  );
}

async function OwnerOnly({ children }: { children: ReactNode }) {
  await requireOwner();
  return children;
}
