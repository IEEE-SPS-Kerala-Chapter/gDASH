import type { UseFormReturn } from "react-hook-form";
import type { RegistrationForm } from "@/lib/validations/registration";
import { AI_THEMES, KERALA_DISTRICTS } from "@/lib/validations/team";
import { MEMBER_YEARS } from "@/lib/validations/member";
import { KERALA_BTECH_COLLEGES, OTHER_COLLEGE } from "@/lib/kerala-colleges";
import { LEADER_VERIFICATION_ENABLED } from "@/lib/config";
import { Field, TextInput, Select, Divider, FormCard } from "./ui";
import { IdCardUploadField } from "./id-card-upload-field";

export function StepTeam({ form }: { form: UseFormReturn<RegistrationForm> }) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const e = errors.team;
  const college = watch("team.college");
  const idCardPath = watch("team.idCardPath");

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

      <Field
        label="3 · College / institution"
        hint="One college for the whole team — every member should be from here."
        error={e?.college?.message}
      >
        <Select {...register("team.college")} defaultValue="">
          <option value="" disabled>
            Choose your college
          </option>
          {KERALA_BTECH_COLLEGES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={OTHER_COLLEGE}>Other</option>
        </Select>
      </Field>
      {college === OTHER_COLLEGE && (
        <Field label="College name" error={e?.collegeOther?.message}>
          <TextInput {...register("team.collegeOther")} placeholder="Enter your college's name" />
        </Field>
      )}

      <Divider />
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">
        Team leader
      </span>

      <div className="flex flex-col gap-[18px] lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-[18px]">
        <Field label="4 · Full name" error={e?.leaderName?.message}>
          <TextInput {...register("team.leaderName")} placeholder="Your full name" />
        </Field>

        <Field
          label="5 · Email"
          hint={LEADER_VERIFICATION_ENABLED ? undefined : "College email — eligibility is checked against it."}
          error={e?.leaderEmail?.message}
        >
          {LEADER_VERIFICATION_ENABLED ? (
            <>
              <TextInput
                type="email"
                {...register("team.leaderEmail")}
                readOnly
                className="cursor-not-allowed bg-gignite-card text-gignite-text/80"
              />
              <span className="text-[13px] leading-[1.45] text-gignite-text/70">
                Verified — wrong account? Use the sign out link above.
              </span>
            </>
          ) : (
            <TextInput type="email" {...register("team.leaderEmail")} placeholder="you@college.ac.in" />
          )}
        </Field>

        <Field label="6 · Phone" error={e?.leaderPhone?.message}>
          <TextInput type="tel" {...register("team.leaderPhone")} placeholder="+91 98765 43210" />
        </Field>
      </div>

      <div className="flex gap-[10px]">
        <div className="min-w-0 flex-1">
          <Field label="7 · Branch" error={e?.branch?.message}>
            <TextInput {...register("team.branch")} placeholder="e.g. CSE" />
          </Field>
        </div>
        <div className="min-w-0 flex-1">
          <Field label="8 · Year" error={e?.year?.message}>
            <Select {...register("team.year")} defaultValue="">
              <option value="" disabled>
                Choose
              </option>
              {MEMBER_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <Field label="9 · District" error={e?.district?.message}>
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

      <IdCardUploadField
        path={idCardPath}
        onUploaded={(path) => setValue("team.idCardPath", path, { shouldValidate: true })}
        error={e?.idCardPath?.message}
      />
    </FormCard>
  );
}
