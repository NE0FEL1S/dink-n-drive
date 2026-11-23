import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { hourLabel, peso } from "@/lib/format";
import { getPublicSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Book the court" };

// Placeholder until the booking flow (Phase 2) replaces it.
export default async function BookPage() {
  const s = await getPublicSettings();

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] min-[390px]:px-5 sm:pt-14">
      <Card className="grid gap-4 p-5 sm:p-7">
        <Eyebrow>Coming soon</Eyebrow>
        <h1 className="font-display text-[28px] leading-[34px] font-semibold text-navy-900">Book the court</h1>
        <p className="text-base text-navy-700">
          Online booking opens soon. The court is open{" "}
          <b className="text-navy-900">
            {hourLabel(s.open_hour)} – {hourLabel(s.close_hour)}
          </b>{" "}
          daily at <b className="tabular text-navy-900">{peso(s.hourly_rate)}</b> per hour.
        </p>
        <ButtonLink href="/" variant="secondary" className="w-full">
          Back to home
        </ButtonLink>
      </Card>
    </main>
  );
}
