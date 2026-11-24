"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { signInWithEmail, signUpWithEmail, type AuthFormState } from "./actions";

type Mode = "signin" | "signup";

export function LoginForm({ next }: { next: string }) {
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
        Forgot your password? Message the court owner. They can set a new one for you after checking your phone number.
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
