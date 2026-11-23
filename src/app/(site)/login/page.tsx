import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { safeNextPath } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] min-[390px]:px-5 sm:pt-14">
      <Card className="p-5 sm:p-7">
        <Suspense fallback={<LoginSkeleton />}>
          {searchParams.then((params) => {
            const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
            return <LoginForm next={next} />;
          })}
        </Suspense>
      </Card>
    </main>
  );
}

function LoginSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      <div className="h-9 w-2/3 rounded-lg bg-ice-100" />
      <div className="h-5 w-full rounded bg-ice-100" />
      <div className="h-12 rounded-[var(--radius-control)] bg-ice-100" />
      <div className="h-12 rounded-[var(--radius-control)] bg-ice-100" />
      <div className="h-12 rounded-full bg-ice-100" />
    </div>
  );
}
