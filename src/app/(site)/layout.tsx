import { SiteShell } from "@/components/site-shell";

/** Inner pages: sky band + sticky frosted header + page content on the ice-50 background. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
