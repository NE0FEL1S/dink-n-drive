import { Eyebrow } from "@/components/ui/card";

// Placeholder until the landing page (docs/DESIGN.md §5) and booking flow are built.
export default function Home() {
  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 place-content-center gap-5 px-4 py-12 text-center min-[390px]:px-5">
      <Eyebrow className="mx-auto">Luyang · open daily</Eyebrow>
      <h1 className="font-display text-[36px] leading-10 font-semibold text-navy-900 sm:text-5xl sm:leading-[56px]">
        Book your hour.
        <br />
        <em className="text-orange-500">Own the kitchen.</em>
      </h1>
      <p className="mx-auto max-w-sm text-base text-slate-500">Online booking is coming soon.</p>
    </main>
  );
}
