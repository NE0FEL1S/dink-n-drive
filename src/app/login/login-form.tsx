"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { signInWithEmail, signInWithGoogle, signUpWithEmail, type AuthFormState } from "./actions";

type Mode = "signin" | "signup";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [mode, setMode] = useState<Mode>("signin");

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="font-display text-[28px] leading-[34px] font-semibold text-navy-900">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="text-[15px] leading-6 text-slate-500">
          Log in to post, comment, react and leave feedback. You don&apos;t need an account to book the court.
        </p>
      </div>

      {initialError && <FormMessage tone="error">{initialError}</FormMessage>}

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <SubmitButton variant="secondary" className="w-full">
          <span className="flex items-center gap-3">
            <GoogleIcon /> Continue with Google
          </span>
        </SubmitButton>
      </form>

      <div className="flex items-center gap-3 text-sm font-medium text-slate-500" aria-hidden="true">
        <span className="h-px flex-1 bg-line" /> or use email <span className="h-px flex-1 bg-line" />
      </div>

      {mode === "signin" ? <SignInForm next={next} /> : <SignUpForm next={next} />}

      <p className="text-center text-[15px] text-slate-500">
        {mode === "signin" ? "New here? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="inline-flex min-h-12 items-center px-1 font-semibold text-glacier-700 underline-offset-4 hover:underline"
        >
          {mode === "signin" ? "Create an account" : "Log in"}
        </button>
      </p>
    </div>
  );
}

function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signInWithEmail, {});
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        enterKeyHint="next"
        defaultValue={state.values?.email}
        error={state.fields?.email}
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        enterKeyHint="done"
        error={state.fields?.password}
        required
      />
      <SubmitButton variant="cta" className="mt-1 w-full text-[17px]" pending={pending}>
        Log in
      </SubmitButton>
      <p className="text-sm text-slate-500">
        Forgot your password? Message the court owner and they can set a temporary one for you.
      </p>
    </form>
  );
}

function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(signUpWithEmail, {});
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <Field
        label="Full name"
        name="fullName"
        autoComplete="name"
        enterKeyHint="next"
        defaultValue={state.values?.fullName}
        error={state.fields?.fullName}
        required
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        enterKeyHint="next"
        defaultValue={state.values?.email}
        error={state.fields?.email}
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        enterKeyHint="done"
        hint="At least 8 characters."
        error={state.fields?.password}
        required
      />
      <SubmitButton variant="cta" className="mt-1 w-full text-[17px]" pending={pending}>
        Create account
      </SubmitButton>
    </form>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4.01-3.1Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z" />
    </svg>
  );
}
