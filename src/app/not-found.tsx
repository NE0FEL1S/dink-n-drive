import { SiteShell } from "@/components/site-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
  return (
    <SiteShell>
      <main className="mx-auto w-full max-w-md px-4 pt-8 pb-12 min-[390px]:px-5 sm:pt-14">
        <Card className="grid gap-4 p-5 text-center sm:p-7">
          <h1 className="font-display text-[28px] leading-[34px] font-semibold text-navy-900">Page not found</h1>
          <p className="text-base text-slate-500">This page doesn&apos;t exist yet, or it moved.</p>
          <ButtonLink href="/" variant="secondary" className="mx-auto">
            Back to home
          </ButtonLink>
        </Card>
      </main>
    </SiteShell>
  );
}
