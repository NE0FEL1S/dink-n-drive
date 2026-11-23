import { SiteHeader } from "@/components/site-header";

/** Inner pages: sticky frosted header + page content on the ice-50 background. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  );
}
