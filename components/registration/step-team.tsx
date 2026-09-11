import type { UseFormReturn } from "react-hook-form";
import type { RegistrationForm } from "@/lib/validations/registration";
import { AI_THEMES, KERALA_DISTRICTS } from "@/lib/validations/team";
import { Field, TextInput, Select, Divider, FormCard } from "./ui";

export function StepTeam({ form }: { form: UseFormReturn<RegistrationForm> }) {
  const {
    register,
    formState: { errors },
  } = form;
  const e = errors.team;

  return (
    <FormCard>
      <Field label="1 · Team name" error={e?.teamName?.message}>
        <TextInput {...register("team.teamName")} placeholder="e.g. Neural Nadi" />
      </Field>

      <Field
        label="2 · AI theme"
        hint="One theme per team. Changeable until entries close."
        error={e?.aiTheme?.message}
      >
        <Select {...register("team.aiTheme")} defaultValue="">
          <option value="" disabled>
            Choose a theme
          </option>
          {AI_THEMES.map((theme) => (
            <option key={theme} value={theme}>
              {theme}
            </option>
          ))}
        </Select>
      </Field>

      <Divider />
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">
        Team leader
      </span>

      <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-[18px]">
        <Field label="3 · Full name" error={e?.leaderName?.message}>
          <TextInput {...register("team.leaderName")} placeholder="Your full name" />
        </Field>

        <Field
          label="4 · Email"
          hint="College email — eligibility is checked against it."
          error={e?.leaderEmail?.message}
        >
          <TextInput type="email" {...register("team.leaderEmail")} placeholder="you@college.ac.in" />
        </Field>

        <Field label="5 · Phone" error={e?.leaderPhone?.message}>
          <TextInput type="tel" {...register("team.leaderPhone")} placeholder="+91 98765 43210" />
        </Field>

        <Field label="6 · College / institution" error={e?.college?.message}>
          <TextInput {...register("team.college")} placeholder="e.g. FISAT, Angamaly" />
        </Field>
      </div>

      <Field label="7 · District" error={e?.district?.message}>
        <Select {...register("team.district")} defaultValue="">
          <option value="" disabled>
            Choose a district
          </option>
          {KERALA_DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </Field>
    </FormCard>
  );
}
