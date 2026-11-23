import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Eyebrow } from "@/components/ui/card";
import { isProfileComplete, requireProfile } from "@/lib/auth";
import { toLocalPhMobile } from "@/lib/phone";
import { safeNextPath } from "@/lib/safe-next";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage({ searchParams }: PageProps<"/profile">) {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] min-[390px]:px-5 sm:pt-14">
      <Card className="p-5 sm:p-7">
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileSection searchParams={searchParams} />
        </Suspense>
      </Card>
    </main>
  );
}

async function ProfileSection({ searchParams }: Pick<PageProps<"/profile">, "searchParams">) {
  const params = await searchParams;
  const profile = await requireProfile("/profile");
  const welcome = params.welcome === "1";
  const next = typeof params.next === "string" ? safeNextPath(params.next) : undefined;
  const incomplete = !isProfileComplete(profile);

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        {welcome && <Eyebrow>Almost done</Eyebrow>}
        <h1 className="font-display text-[28px] leading-[34px] font-semibold text-navy-900">
          {welcome || incomplete ? "Complete your profile" : "Your profile"}
        </h1>
        <p className="text-[15px] leading-6 text-slate-500">
          {incomplete
            ? "Add your name and mobile number to post, comment, react and give feedback. We'll also prefill them when you book."
            : "These details are prefilled when you book. Your number and email are never shown publicly."}
        </p>
      </div>
      <ProfileForm
        fullName={profile.full_name ?? ""}
        phone={toLocalPhMobile(profile.phone)}
        email={profile.email}
        next={welcome ? (next ?? "/") : undefined}
      />
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      <div className="h-9 w-2/3 rounded-lg bg-ice-100" />
      <div className="h-10 w-full rounded bg-ice-100" />
      <div className="h-12 rounded-[var(--radius-control)] bg-ice-100" />
      <div className="h-12 rounded-[var(--radius-control)] bg-ice-100" />
      <div className="h-12 rounded-full bg-ice-100" />
    </div>
  );
}
