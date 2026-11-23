import { Suspense } from "react";
import { AccountArea } from "@/components/account-area";
import { hourWords, peso } from "@/lib/format";
import { getPublicSettings } from "@/lib/settings";
import { LandingScene, type LandingCopy } from "./_landing/landing-scene";
import "./landing.css";

// Landing page: one screen, no scrolling (DESIGN.md §5). Prices and hours come from `settings`.
export default async function Home() {
  const s = await getPublicSettings();

  const copy: LandingCopy = {
    openHour: s.open_hour,
    closeHour: s.close_hour,
    hoursText: `${hourWords(s.open_hour)} to ${hourWords(s.close_hour)}`,
    rateText: peso(s.hourly_rate),
    paddleFeeText: peso(s.paddle_fee),
    holdMinutes: s.hold_minutes,
    sampleTotalText: peso(2 * s.hourly_rate + s.paddle_fee),
  };

  return (
    <LandingScene
      copy={copy}
      account={
        <Suspense fallback={<div className="h-[42px] w-[84px] rounded-[12px] bg-white/50" />}>
          <AccountArea loginClassName="l-login" />
        </Suspense>
      }
    />
  );
}
