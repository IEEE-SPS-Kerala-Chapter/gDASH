import { useState } from "react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { normalizeCollegeName, type RegistrationForm } from "@/lib/validations/registration";
import { MEMBER_YEARS } from "@/lib/validations/member";
import { Field, TextInput, Select, FormCard } from "./ui";

const MAX_ADDITIONAL_MEMBERS = 4;
const emptyMember = {
  fullName: "",
  email: "",
  phone: "",
  college: "",
  branch: "",
  year: "",
  roleInTeam: "",
} as unknown as RegistrationForm["members"][number];

export function StepMembers({ form }: { form: UseFormReturn<RegistrationForm> }) {
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "members" });
  const leaderName = watch("team.leaderName");
  const college = watch("team.college");
  const slotsLeft = MAX_ADDITIONAL_MEMBERS - fields.length;

  // Cross-field "same college" validation only actually runs once the
  // schema resolver re-fires (on blur, or when the step is submitted) — so
  // on its own, a member could type a mismatched college and see nothing
  // until they try to move on. Tracking "has this field been left at least
  // once" here lets us show the same check live, right after they finish
  // typing it, independent of when/whether RHF's own validation catches up.
  // Keyed by useFieldArray's stable field.id (not array index) so removing
  // an earlier member doesn't shift a later member's "touched" state onto
  // the wrong row.
  const [collegeTouched, setCollegeTouched] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center gap-3 rounded-xl bg-gignite-blue-pale px-4 py-[14px]">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gignite-blue font-heading text-[13px] font-bold text-white">
          {initials(leaderName)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-black">{leaderName || "Team leader"}</span>
            <span className="inline-flex rounded-full bg-gignite-blue px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-white">
              Leader
            </span>
          </div>
          <span className="text-[12px] text-gignite-blue">{college}</span>
        </div>
      </div>

      {fields.map((field, index) => {
        const e = errors.members?.[index];
        const memberCollege = watch(`members.${index}.college`);
        const collegeMismatch =
          Boolean(collegeTouched[field.id]) &&
          Boolean(college?.trim()) &&
          Boolean(memberCollege?.trim()) &&
          normalizeCollegeName(memberCollege) !== normalizeCollegeName(college);
        const collegeError =
          e?.college?.message ??
          (collegeMismatch
            ? `Doesn't match the team's college (${college}). If it's the same college, try dropping the location, e.g. "FISAT" instead of "FISAT, Angamaly".`
            : undefined);
        const collegeReg = register(`members.${index}.college`);

        return (
          <FormCard key={field.id}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gignite-blue">
                Member {index + 2}
              </span>
              <button
                type="button"
                onClick={() => remove(index)}
                className="text-[13px] font-semibold text-gignite-muted hover:text-gignite-danger"
              >
                Remove
              </button>
            </div>

            <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-4">
              <Field label="Full name" error={e?.fullName?.message}>
                <TextInput {...register(`members.${index}.fullName`)} />
              </Field>
              <Field label="Email" error={e?.email?.message}>
                <TextInput type="email" {...register(`members.${index}.email`)} />
              </Field>
              <Field label="Phone" error={e?.phone?.message}>
                <TextInput type="tel" {...register(`members.${index}.phone`)} />
              </Field>
              <Field
                label="College / institution"
                error={collegeError}
                hint={college ? `Must match the team's college: ${college}` : undefined}
              >
                <TextInput
                  {...collegeReg}
                  onBlur={(ev) => {
                    void collegeReg.onBlur(ev);
                    setCollegeTouched((prev) => ({ ...prev, [field.id]: true }));
                  }}
                />
              </Field>
            </div>
            <div className="flex gap-[10px]">
              <div className="min-w-0 flex-1">
                <Field label="Branch" error={e?.branch?.message}>
                  <TextInput {...register(`members.${index}.branch`)} placeholder="e.g. CSE" />
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
              <TextInput {...register(`members.${index}.roleInTeam`)} placeholder="e.g. ML engineer" />
            </Field>
          </FormCard>
        );
      })}

      {slotsLeft > 0 && (
        <button
          type="button"
          onClick={() => append(emptyMember)}
          className="w-full rounded-[11px] border-[1.5px] border-dashed border-gignite-border-strong py-[13px] font-heading text-[15px] font-medium text-gignite-blue transition-colors hover:border-gignite-blue hover:bg-gignite-surface"
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
