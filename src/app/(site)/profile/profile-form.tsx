"use client";

import { useActionState } from "react";
import { Field, FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateProfile, type ProfileFormState } from "./actions";

type Props = {
  fullName: string;
  phone: string; // 09XXXXXXXXX
  email: string | null;
  /** After first sign-in: continue here once saved. */
  next?: string;
};

export function ProfileForm({ fullName, phone, email, next }: Props) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(updateProfile, {});

  return (
    <form action={action} className="grid gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state.saved && <FormMessage tone="success">Saved. Your details will be prefilled when you book.</FormMessage>}

      <Field
        label="Full name"
        name="fullName"
        autoComplete="name"
        enterKeyHint="next"
        defaultValue={state.values?.fullName ?? fullName}
        error={state.fields?.fullName}
        required
      />
      <Field
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        enterKeyHint="done"
        placeholder="09XXXXXXXXX"
        maxLength={16}
        hint="PH mobile, 11 digits. Only the court owner sees it."
        defaultValue={state.values?.phone ?? phone}
        error={state.fields?.phone}
        required
      />
      {email && <Field label="Email" name="email-readonly" type="email" autoComplete="email" enterKeyHint="done" value={email} readOnly hint="Your sign-in email." />}

      <SubmitButton variant="primary" className="mt-1 w-full" pending={pending}>
        {next ? "Save and continue" : "Save"}
      </SubmitButton>
    </form>
  );
}
