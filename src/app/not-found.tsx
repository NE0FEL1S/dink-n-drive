import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto grid w-full max-w-md flex-1 place-content-center gap-4 px-4 py-12 text-center">
        <h1 className="font-display text-[28px] leading-[34px] font-semibold text-navy-900">Page not found</h1>
        <p className="text-base text-slate-500">This page doesn&apos;t exist yet, or it moved.</p>
        <ButtonLink href="/" variant="secondary" className="mx-auto">
          Back to home
        </ButtonLink>
      </main>
    </>
  );
}
