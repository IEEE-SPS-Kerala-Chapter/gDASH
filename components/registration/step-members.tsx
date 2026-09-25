import { useFieldArray, type UseFormReturn } from "react-hook-form";
import type { RegistrationForm } from "@/lib/validations/registration";
import { MEMBER_YEARS } from "@/lib/validations/member";
import { TEAM_ROLES, OTHER_ROLE } from "@/lib/validations/roles";
import { useDuplicateContactCheck } from "@/lib/registration-duplicate-check";
import { Field, TextInput, Select, FormCard } from "./ui";
import { IdCardUploadField } from "./id-card-upload-field";

const MAX_ADDITIONAL_MEMBERS = 4;
const emptyMember = {
  fullName: "",
  email: "",
  phone: "",
  branch: "",
  year: "",
  roleInTeam: "",
  roleInTeamOther: "",
  idCardPath: "",
} as unknown as RegistrationForm["members"][number];

export function StepMembers({ form }: { form: UseFormReturn<RegistrationForm> }) {
  const {
    register,
    control,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "members" });
  const { onBlurCheck } = useDuplicateContactCheck(form);
  const leaderName = watch("team.leaderName");
  const college = watch("team.college");
  const collegeOther = watch("team.collegeOther");
  const displayCollege = college === "Other" ? collegeOther : college;
  const slotsLeft = MAX_ADDITIONAL_MEMBERS - fields.length;
  const membersArrayError = (errors.members as { message?: string } | undefined)?.message;

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center gap-3 rounded-xl bg-ignite-lavender px-4 py-[14px]">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-gradient font-display text-[13px] font-bold text-white">
          {initials(leaderName)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-ignite-ink">{leaderName || "Team leader"}</span>
            <span className="inline-flex rounded-full bg-ignite-primary px-2 py-0.5 font-ui text-[9px] font-bold uppercase tracking-[0.1em] text-ignite-on-primary">
              Leader
            </span>
          </div>
          <span className="text-[12px] text-ignite-ink">{displayCollege}</span>
        </div>
      </div>

      {fields.map((field, index) => {
        const e = errors.members?.[index];
        const memberRole = watch(`members.${index}.roleInTeam`);
        const idCardPath = watch(`members.${index}.idCardPath`);

        return (
          <FormCard key={field.id}>
            <div className="flex items-center justify-between">
              <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-ink">
                Member {index + 2}
              </span>
              <button
                type="button"
                onClick={() => remove(index)}
                className="text-[13px] font-semibold text-ignite-muted hover:text-ignite-danger"
              >
                Remove
              </button>
            </div>

            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-4">
              <Field label="Full name" error={e?.fullName?.message}>
                <TextInput {...register(`members.${index}.fullName`)} maxLength={80} />
              </Field>
              <Field label="Email" error={e?.email?.message}>
                <TextInput
                  type="email"
                  {...register(`members.${index}.email`, { onBlur: onBlurCheck(`members.${index}.email`, "email") })}
                />
              </Field>
              <Field label="Phone" error={e?.phone?.message}>
                <TextInput
                  type="tel"
                  {...register(`members.${index}.phone`, { onBlur: onBlurCheck(`members.${index}.phone`, "phone") })}
                />
              </Field>
              <Field label="College" hint="Same as the team's college">
                <TextInput value={displayCollege ?? ""} readOnly className="cursor-not-allowed bg-ignite-bg text-ignite-muted" />
              </Field>
            </div>
            <div className="flex gap-[10px]">
              <div className="min-w-0 flex-1">
                <Field label="Branch" error={e?.branch?.message}>
                  <TextInput {...register(`members.${index}.branch`)} maxLength={60} placeholder="e.g. CSE" />
                </Field>
              </div>
              <div className="min-w-0 flex-1">
                <Field label="Year" error={e?.year?.message}>
                  <Select {...register(`members.${index}.year`)} defaultValue="">
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
            <Field label="Role in team" error={e?.roleInTeam?.message}>
              <Select {...register(`members.${index}.roleInTeam`)} defaultValue="">
                <option value="" disabled>
                  Choose a role
                </option>
                {TEAM_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            {memberRole === OTHER_ROLE && (
              <Field label="Role (specify)" error={e?.roleInTeamOther?.message}>
                <TextInput {...register(`members.${index}.roleInTeamOther`)} maxLength={60} placeholder="e.g. Product design" />
              </Field>
            )}

            <IdCardUploadField
              path={idCardPath}
              onUploaded={(path) => setValue(`members.${index}.idCardPath`, path, { shouldValidate: true })}
              error={e?.idCardPath?.message}
            />
          </FormCard>
        );
      })}

      {membersArrayError && (
        <span data-field-error role="alert" className="text-[13px] leading-[1.45] text-ignite-danger">
          {membersArrayError}
        </span>
      )}

      {slotsLeft > 0 && (
        <button
          type="button"
          onClick={() => append(emptyMember)}
          className="w-full rounded-full border-[1.5px] border-dashed border-ignite-edge/[0.18] py-[13px] font-ui text-[15px] font-semibold text-ignite-ink transition-colors hover:border-ignite-ink hover:bg-ignite-surface"
        >
          + Add member ({slotsLeft} slot{slotsLeft === 1 ? "" : "s"} left)
        </button>
      )}
    </div>
  );
}

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
