import { Phone } from "lucide-react";
import { localPhone, visitDate, type CustomerRow } from "@/lib/admin-customers";
import { initials, peso } from "@/lib/format";
import { ResetPasswordButton } from "./reset-password";

/** Account · Guest · Account + guest (an account holder who also booked without logging in). */
function TypeChip({ row }: { row: CustomerRow }) {
  const label = row.accounts.length === 0 ? "Guest" : row.guestBookings > 0 ? "Account + guest" : "Account";
  return (
    <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-neutral-bg px-2.5 text-xs font-semibold whitespace-nowrap text-neutral">
      {label}
    </span>
  );
}

function PhoneLink({ phone, icon = false, className = "" }: { phone: string; icon?: boolean; className?: string }) {
  return (
    <a href={`tel:${phone}`} className={`text-glacier-700 tabular-nums hover:underline ${className}`}>
      {icon && <Phone className="size-4" aria-hidden="true" />}
      {localPhone(phone)}
    </a>
  );
}

/** Extra accounts in the same phone group (rare: two sign-ups sharing a number). */
function OtherAccounts({ row }: { row: CustomerRow }) {
  if (row.accounts.length < 2) return null;
  return (
    <p className="text-sm text-slate-500">
      {row.accounts.length} accounts use this number:{" "}
      {row.accounts.map((a) => a.email ?? a.name ?? "No email").join(", ")}
    </p>
  );
}

/** Accounts that log in with a password get "Set new password" (owner-assisted reset). */
function resettable(row: CustomerRow) {
  return row.accounts.filter((a) => a.canReset);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-semibold tracking-[0.04em] text-slate-500 uppercase">{label}</dt>
      <dd className="text-[17px] leading-6 font-bold text-navy-900 tabular-nums">{value}</dd>
    </div>
  );
}

const hoursText = (h: number) => (h === 1 ? "1 h" : `${h} h`);

/**
 * The customers list (SPEC §4). Cards below 1280 px (1 column on phones, 2 from 768 px), a
 * table from 1280 px, like Bookings. Money and counts follow the earnings rule: paid bookings
 * only, plus cancellation fees kept.
 */
export function CustomerList({ rows }: { rows: CustomerRow[] }) {
  return (
    <>
      {/* phones and tablets */}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:hidden">
        {rows.map((r) => (
          <li key={r.key}>
            <article
              aria-label={`Customer ${r.name}`}
              className="grid h-full grid-cols-[minmax(0,1fr)] content-start gap-4 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-soft)] min-[390px]:p-5"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 text-sm font-bold text-orange-600"
                >
                  {initials(r.name)}
                </span>
                <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] gap-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 pt-0.5 text-[15px] leading-5 font-bold [overflow-wrap:anywhere] text-navy-900">{r.name}</p>
                    <TypeChip row={r} />
                  </div>
                  {r.phone ? (
                    <PhoneLink
                      phone={r.phone}
                      icon
                      className="flex min-h-11 w-fit items-center gap-2 text-[15px] font-semibold"
                    />
                  ) : (
                    <p className="text-sm text-slate-500">No phone on file</p>
                  )}
                  {r.email && <p className="truncate text-sm text-slate-500">{r.email}</p>}
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-3 rounded-[12px] bg-ice-50 px-4 py-3">
                <Stat label="Bookings" value={String(r.bookings)} />
                <Stat label="Hours" value={hoursText(r.hours)} />
                <Stat label="Spent" value={peso(r.totalSpent)} />
              </dl>

              <div className="grid gap-1 text-sm text-navy-700">
                <p>
                  <span className="text-slate-500">Last visit </span>
                  <span className="font-semibold">{r.lastVisit ? visitDate(r.lastVisit) : "None yet"}</span>
                  {r.nextVisit && (
                    <>
                      <span className="text-slate-500"> · Next </span>
                      <span className="font-semibold">{visitDate(r.nextVisit)}</span>
                    </>
                  )}
                </p>
                <OtherAccounts row={r} />
              </div>

              {resettable(r).length > 0 && (
                <div className="grid gap-2 border-t border-line pt-3 sm:flex sm:flex-wrap sm:justify-end">
                  {resettable(r).map((a) => (
                    <ResetPasswordButton key={a.id} account={a} showEmail={r.accounts.length > 1} className="w-full sm:w-auto" />
                  ))}
                </div>
              )}
            </article>
          </li>
        ))}
      </ul>

      {/* laptops */}
      <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-soft)] xl:block">
        <table className="w-full border-collapse text-left text-sm text-navy-700">
          <caption className="sr-only">Customers</caption>
          <thead className="bg-ice-50 text-xs font-semibold tracking-[0.04em] text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">Customer</th>
              <th scope="col" className="px-4 py-3">Phone</th>
              <th scope="col" className="px-4 py-3 text-right">Bookings</th>
              <th scope="col" className="px-4 py-3 text-right">Hours</th>
              <th scope="col" className="px-4 py-3 text-right">Spent</th>
              <th scope="col" className="px-4 py-3">Visits</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} aria-label={`Customer ${r.name}`} className="border-t border-line align-top">
                <td className="max-w-[280px] px-4 py-3">
                  <span className="flex items-center gap-2 font-semibold text-navy-900">
                    <span className="truncate">{r.name}</span> <TypeChip row={r} />
                  </span>
                  {r.email && <span className="block truncate text-slate-500">{r.email}</span>}
                  <OtherAccounts row={r} />
                  {resettable(r).map((a) => (
                    <span key={a.id} className="-ml-3 block">
                      <ResetPasswordButton account={a} showEmail={r.accounts.length > 1} compact />
                    </span>
                  ))}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.phone ? <PhoneLink phone={r.phone} className="font-semibold" /> : <span className="text-slate-500">No phone on file</span>}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-navy-900 tabular-nums">{r.bookings}</td>
                <td className="px-4 py-3 text-right tabular-nums">{hoursText(r.hours)}</td>
                <td className="px-4 py-3 text-right text-[15px] font-bold text-navy-900 tabular-nums">{peso(r.totalSpent)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="block">
                    <span className="text-slate-500">Last </span>
                    {r.lastVisit ? visitDate(r.lastVisit) : "None yet"}
                  </span>
                  {r.nextVisit && (
                    <span className="block">
                      <span className="text-slate-500">Next </span>
                      {visitDate(r.nextVisit)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
