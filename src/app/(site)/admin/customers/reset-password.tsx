"use client";

import { useId, useState, useTransition } from "react";
import { Check, CheckCircle2, Copy, KeyRound } from "lucide-react";
import { useCloseGuard } from "@/components/close-guard";
import { Button, buttonClass, Spinner } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import type { CustomerAccount } from "@/lib/admin-customers";
import { setCustomerPassword } from "./actions";

type Props = {
  account: CustomerAccount;
  /** Shown when the phone group has more than one account, so the owner picks the right one. */
  showEmail?: boolean;
  /** Table rows: a small text button instead of the white outline one. */
  compact?: boolean;
  className?: string;
};

/**
 * "Set new password" (SPEC §3, owner-assisted reset): the owner asks the customer for the
 * phone number on their account, types it with a new password, and tells the customer the
 * password in person or by message. The database checks the phone before anything changes.
 */
export function ResetPasswordButton({ account, showEmail = false, compact = false, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);
  const who = account.name ?? account.email ?? "this customer";

  const close = () => {
    setOpen(false);
    setDone(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Set new password for ${account.email ?? who}`}
        className={
          compact
            ? buttonClass("ghost", `min-h-11 max-w-full gap-1.5 px-3 text-sm ${className}`)
            : buttonClass("secondary", `min-h-11 max-w-full px-4 text-[15px] ${className}`)
        }
      >
        <KeyRound className={`size-4 shrink-0 ${compact ? "" : "text-navy-700"}`} aria-hidden="true" />
        <span className="truncate">{showEmail && account.email ? `New password · ${account.email}` : "Set new password"}</span>
      </button>
      <Sheet open={open} title={done ? "Password changed" : "Set a new password"} onClose={close}>
        {done ? (
          <Done who={who} email={done.email} password={done.password} onClose={close} />
        ) : (
          <ResetForm account={account} who={who} onDone={(email, password) => setDone({ email, password })} onBack={close} />
        )}
      </Sheet>
    </>
  );
}

function ResetForm({
  account,
  who,
  onDone,
  onBack,
}: {
  account: CustomerAccount;
  who: string;
  onDone: (email: string, password: string) => void;
  onBack: () => void;
}) {
  const id = useId();
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Partial<Record<"phone" | "password", string>>>({});
  useCloseGuard(phone || password ? "Close without changing the password?" : null);

  const passwordHintId = `${id}-pw-hint`;
  const passwordErrorId = `${id}-pw-error`;

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await setCustomerPassword({ userId: account.id, phone, password });
          if (r.ok) return onDone(r.email, password);
          setFields(r.fields ?? {});
          setError(r.fields ? null : r.error);
        });
      }}
    >
      <div className="grid gap-0.5 rounded-[var(--radius-control)] bg-ice-50 px-4 py-3">
        <p className="text-[15px] font-semibold [overflow-wrap:anywhere] text-navy-900">{who}</p>
        <p className="text-sm [overflow-wrap:anywhere] text-slate-500">Logs in with {account.email}</p>
      </div>

      <p className="text-[15px] leading-6 text-navy-700">
        Ask the customer for the phone number on their account. The new password is only set if it matches.
      </p>

      <Field
        label="Customer's phone number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        enterKeyHint="next"
        placeholder="09171234567"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
          if (fields.phone) setFields((f) => ({ ...f, phone: undefined }));
        }}
        error={fields.phone}
      />

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-pw`} className="text-sm font-semibold text-navy-900">
          New password
        </label>
        <span className="relative">
          <input
            id={`${id}-pw`}
            name="new-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            maxLength={72}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fields.password) setFields((f) => ({ ...f, password: undefined }));
            }}
            aria-invalid={fields.password ? true : undefined}
            aria-describedby={fields.password ? passwordErrorId : passwordHintId}
            className={
              "h-12 w-full rounded-[var(--radius-control)] border bg-white pr-20 pl-4 text-base text-navy-900 outline-none " +
              "transition-[border-color,box-shadow] duration-150 focus:border-orange-600 focus:ring-2 focus:ring-orange-500/40 " +
              (fields.password ? "border-danger" : "border-line")
            }
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-pressed={!show}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute top-0 right-0 flex h-12 min-w-16 touch-manipulation items-center justify-center rounded-r-[var(--radius-control)] px-3 text-sm font-semibold text-glacier-700 hover:bg-ice-50"
          >
            {show ? "Hide" : "Show"}
          </button>
        </span>
        {fields.password ? (
          <p id={passwordErrorId} className="text-sm font-medium text-danger">
            {fields.password}
          </p>
        ) : (
          <p id={passwordHintId} className="text-sm text-slate-500">
            At least 8 characters. You&apos;ll tell the customer this password, so it shows as you type.
          </p>
        )}
      </div>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <div className="grid gap-3">
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className={buttonClass("primary", "relative w-full")}
        >
          <span className={pending ? "invisible" : undefined}>Set password</span>
          {pending && (
            <span className="absolute inset-0 grid place-items-center">
              <Spinner />
            </span>
          )}
        </button>
        <Button variant="ghost" className="w-full" onClick={onBack} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Done({ who, email, password, onClose }: { who: string; email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-4">
      <p className="flex items-start gap-3 text-[15px] leading-6 text-navy-700">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        <span>
          {who} can log in now with <b className="font-semibold [overflow-wrap:anywhere] text-navy-900">{email}</b> and this password:
        </span>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] bg-ice-50 px-4 py-3">
        <p className="min-w-0 font-mono text-[20px] leading-7 font-bold [overflow-wrap:anywhere] text-navy-900" data-testid="new-password">
          {password}
        </p>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Password copied" : "Copy password"}
          className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-full border border-line bg-white px-3.5 text-sm font-semibold text-navy-900 hover:bg-ice-50 active:bg-ice-100"
        >
          {copied ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-sm text-slate-500">
        Tell the customer in person or by message. It isn&apos;t shown again after you close this.
      </p>
      <Button variant="primary" className="w-full" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}
