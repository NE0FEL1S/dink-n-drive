import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import type { Viewer } from "@/lib/community";

/**
 * Floating "+ Post" / "+ Feedback", bottom-right above the home indicator (DESIGN §5).
 * Members open the composer; guests go to log in, accounts without a name + phone to Profile
 * (both come back to `returnPath`).
 */
export function ComposeButton({
  viewer,
  label,
  action,
  returnPath,
  onCompose,
}: {
  viewer: Viewer;
  /** On the button: "Post", "Feedback". */
  label: string;
  /** For the gated links: "Log in to {action}", e.g. "post", "give feedback". */
  action: string;
  returnPath: string;
  onCompose: () => void;
}) {
  const className = buttonClass(
    "cta",
    "fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 min-h-14 touch-manipulation px-6 text-[17px] shadow-[0_10px_28px_rgb(191_74_18/0.35)] min-[390px]:right-5 sm:right-8 sm:bottom-8",
  );
  const content = (
    <>
      <Plus className="size-5" strokeWidth={2.5} aria-hidden="true" /> {label}
    </>
  );
  if (viewer === "member") {
    return (
      <button type="button" className={className} onClick={onCompose}>
        {content}
      </button>
    );
  }
  const next = encodeURIComponent(returnPath);
  return (
    <Link
      href={viewer === "guest" ? `/login?next=${next}` : `/profile?welcome=1&next=${next}`}
      className={className}
      aria-label={viewer === "guest" ? `Log in to ${action}` : `Complete your profile to ${action}`}
    >
      {content}
    </Link>
  );
}
