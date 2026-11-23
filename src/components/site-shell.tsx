import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";

/** Inner-page frame: sky band (decorative) + sticky frosted header + page content. */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col">
      <div className="site-sky" aria-hidden="true" />
      <SiteHeader />
      <div className="relative z-[1] flex flex-1 flex-col">{children}</div>
    </div>
  );
}
