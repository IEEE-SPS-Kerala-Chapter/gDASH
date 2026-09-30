"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { updateRegistrationDetails, type AdminTeam } from "@/app/actions/admin";
import { createUploadUrl, type UploadKind } from "@/app/actions/uploads";
import { createClient } from "@/lib/supabase/client";
import { AI_THEMES, KERALA_DISTRICTS } from "@/lib/validations/team";
import { MEMBER_YEARS } from "@/lib/validations/member";
import { TEAM_ROLES } from "@/lib/validations/roles";
import { KERALA_BTECH_COLLEGES } from "@/lib/kerala-colleges";
import type { RegistrationEdit } from "@/lib/validations/registration-edit";
import { Field, Panel, PrimaryButton, SecondaryButton, SectionLabel, Select, Spinner, TextArea, TextInput } from "@/components/admin/ui";

const FILE_RULES: Record<UploadKind, { bucket: string; types: string[]; accept: string; maxBytes: number; label: string }> = {
  "id-card": {
    bucket: "member-id-cards",
    types: ["image/jpeg", "image/png", "image/webp"],
    accept: "image/jpeg,image/png,image/webp",
    maxBytes: 8 * 1024 * 1024,
    label: "JPG, PNG, or WEBP · 8 MB max",
  },
  deck: {
    bucket: "registration-decks",
    types: ["application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    accept: ".pdf,.pptx",
    maxBytes: 20 * 1024 * 1024,
    label: "PDF or PPTX · 20 MB max",
  },
};

const IDEA_FIELDS = [
  { key: "problemStatement", label: "Problem statement", min: 50 },
  { key: "proposedSolution", label: "Proposed solution", min: 50 },
  { key: "aiApproach", label: "AI approach / technology", min: 30 },
  { key: "expectedImpact", label: "Expected impact", min: 30 },
] as const;

function initialForm(team: AdminTeam): RegistrationEdit {
  const reg = team.registration!;
  return {
    team: {
      name: team.name,
      aiTheme: team.ai_theme as RegistrationEdit["team"]["aiTheme"],
      district: team.district as RegistrationEdit["team"]["district"],
      college: team.members.find((m) => m.is_leader)?.college ?? team.members[0]?.college ?? "",
    },
    members: team.members.map((m) => ({
      id: m.id,
      isLeader: m.is_leader,
      fullName: m.full_name,
      email: m.email,
      phone: m.phone,
      branch: m.branch ?? "",
      year: (m.year ?? "") as RegistrationEdit["members"][number]["year"],
      roleInTeam: m.role_in_team ?? "",
      idCardPath: null,
    })),
    idea: {
      problemStatement: reg.problem_statement,
      proposedSolution: reg.proposed_solution,
      aiApproach: reg.ai_approach,
      expectedImpact: reg.expected_impact,
      supportingLink: reg.supporting_link ?? "",
      deckPath: null,
    },
  };
}

/**
 * Super-admin only: correct a submitted registration (team, members, idea,
 * replacement ID cards / deck). Shown in place of the read-only panels on
 * the team page; the server refuses it once judging has started.
 */
export function EditRegistration({
  team,
  onDone,
  onStale,
}: {
  team: AdminTeam;
  onDone: () => void;
  /** Someone else changed the team meanwhile — reload the latest. */
  onStale: () => void;
}) {
  const [form, setForm] = useState<RegistrationEdit>(() => initialForm(team));
  // The version the form was filled from. Live refresh keeps updating
  // `team` underneath; saving against the new version would silently
  // overwrite a change made meanwhile, so the server compares to this one.
  const [baseVersion] = useState(() => team.registration!.version);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const originalLeaderEmail = team.members.find((m) => m.is_leader)?.email;
  const leaderEmailChanged = form.members.some((m) => m.isLeader && m.email.trim().toLowerCase() !== originalLeaderEmail);

  const setTeam = (patch: Partial<RegistrationEdit["team"]>) => setForm((f) => ({ ...f, team: { ...f.team, ...patch } }));
  const setIdea = (patch: Partial<RegistrationEdit["idea"]>) => setForm((f) => ({ ...f, idea: { ...f.idea, ...patch } }));
  const setMember = (id: string, patch: Partial<RegistrationEdit["members"][number]>) =>
    setForm((f) => ({ ...f, members: f.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));

  async function save() {
    if (leaderEmailChanged && !window.confirm("You changed the leader's email. They will need to sign in with the new email to see their status page. Save?")) {
      return;
    }
    setSaving(true);
    const result = await updateRegistrationDetails(team.id, baseVersion, form).catch(() => ({
      success: false as const,
      error: "No connection — nothing was saved.",
      stale: false,
    }));
    setSaving(false);
    if (result.success) {
      toast.success("Details updated.");
      onDone();
      return;
    }
    toast.error(result.error);
    if (result.stale) onStale();
  }

  return (
    <div className="flex flex-col gap-5">
      <Panel className="flex flex-col gap-4 p-5">
        <EditHeading>Team</EditHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Team name">
            <TextInput value={form.team.name} maxLength={50} onChange={(e) => setTeam({ name: e.target.value })} />
          </Field>
          <Field label="AI theme">
            <Select value={form.team.aiTheme} onChange={(e) => setTeam({ aiTheme: e.target.value as RegistrationEdit["team"]["aiTheme"] })}>
              {AI_THEMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="District">
            <Select
              value={form.team.district}
              onChange={(e) => setTeam({ district: e.target.value as RegistrationEdit["team"]["district"] })}
            >
              {KERALA_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="College (all members)">
            <TextInput
              value={form.team.college}
              maxLength={120}
              list="edit-college-options"
              onChange={(e) => setTeam({ college: e.target.value })}
            />
            <datalist id="edit-college-options">
              {KERALA_BTECH_COLLEGES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
      </Panel>

      {form.members.map((m, i) => {
        const original = team.members.find((o) => o.id === m.id);
        return (
          <Panel key={m.id} className="flex flex-col gap-4 p-5">
            <EditHeading>
              {m.isLeader ? "Team leader" : `Member ${i + 1}`} · {original?.member_code}
            </EditHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full name">
                <TextInput value={m.fullName} maxLength={80} onChange={(e) => setMember(m.id, { fullName: e.target.value })} />
              </Field>
              <Field label="Email" hint={m.isLeader ? "The leader signs in with this email to see their status page." : undefined}>
                <TextInput type="email" value={m.email} onChange={(e) => setMember(m.id, { email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <TextInput type="tel" value={m.phone} maxLength={14} onChange={(e) => setMember(m.id, { phone: e.target.value })} />
              </Field>
              <Field label="Branch">
                <TextInput value={m.branch} maxLength={60} onChange={(e) => setMember(m.id, { branch: e.target.value })} />
              </Field>
              <Field label="Year">
                <Select
                  value={m.year}
                  onChange={(e) => setMember(m.id, { year: e.target.value as RegistrationEdit["members"][number]["year"] })}
                >
                  {!m.year && <option value="">Choose a year</option>}
                  {MEMBER_YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </Field>
              {!m.isLeader && (
                <Field label="Role in team">
                  <TextInput
                    value={m.roleInTeam}
                    maxLength={60}
                    list="edit-role-options"
                    onChange={(e) => setMember(m.id, { roleInTeam: e.target.value })}
                  />
                </Field>
              )}
            </div>
            <ReplaceFileField
              kind="id-card"
              label="Replace ID card"
              onUploading={(busy) => setUploading((n) => n + (busy ? 1 : -1))}
              onUploaded={(path) => setMember(m.id, { idCardPath: path })}
            />
          </Panel>
        );
      })}
      <datalist id="edit-role-options">
        {TEAM_ROLES.filter((r) => r !== "Other").map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <Panel className="flex flex-col gap-4 p-5">
        <EditHeading>Idea</EditHeading>
        {IDEA_FIELDS.map(({ key, label, min }) => {
          const len = form.idea[key].length;
          return (
            <Field
              key={key}
              label={label}
              trailing={
                <span className={len < min || len > 1500 ? "text-ignite-danger" : "text-ignite-muted"}>
                  {len} / 1500 (min {min})
                </span>
              }
            >
              <TextArea rows={5} value={form.idea[key]} onChange={(e) => setIdea({ [key]: e.target.value })} />
            </Field>
          );
        })}
        <Field label="Supporting link (optional)">
          <TextInput
            type="url"
            value={form.idea.supportingLink ?? ""}
            maxLength={2048}
            onChange={(e) => setIdea({ supportingLink: e.target.value })}
          />
        </Field>
        <ReplaceFileField
          kind="deck"
          label="Replace pitch deck"
          onUploading={(busy) => setUploading((n) => n + (busy ? 1 : -1))}
          onUploaded={(path) => setIdea({ deckPath: path })}
        />
      </Panel>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-56">
          <PrimaryButton type="button" onClick={save} disabled={saving || uploading > 0} loading={saving}>
            {saving ? "Saving…" : uploading > 0 ? "Uploading…" : "Save changes"}
          </PrimaryButton>
        </div>
        <div className="sm:w-40">
          <SecondaryButton type="button" onClick={onDone} disabled={saving}>
            Cancel
          </SecondaryButton>
        </div>
      </div>
      <span className="text-[12px] text-ignite-muted">
        Every change is recorded in the audit log. Entry ID, member codes and check-in QR codes stay the same.
      </span>
    </div>
  );
}

function EditHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <SectionLabel>{children}</SectionLabel>
      <span className="font-ui text-[12px] font-bold uppercase tracking-[0.14em] text-ignite-orange">Editing</span>
    </div>
  );
}

type FileState = { status: "idle" } | { status: "uploading"; name: string } | { status: "done"; name: string } | { status: "error"; message: string };

/** Uploads a replacement file with the same rules as the registration form; the swap happens on Save. */
function ReplaceFileField({
  kind,
  label,
  onUploading,
  onUploaded,
}: {
  kind: UploadKind;
  label: string;
  onUploading: (busy: boolean) => void;
  onUploaded: (path: string) => void;
}) {
  const rules = FILE_RULES[kind];
  const [state, setState] = useState<FileState>({ status: "idle" });

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!rules.types.includes(file.type)) {
      setState({ status: "error", message: `Only ${rules.label.split(" · ")[0]} files are accepted.` });
      return;
    }
    if (file.size > rules.maxBytes) {
      setState({ status: "error", message: `File is larger than ${rules.maxBytes / (1024 * 1024)} MB.` });
      return;
    }
    setState({ status: "uploading", name: file.name });
    onUploading(true);
    try {
      const link = await createUploadUrl(kind, file.name).catch(() => null);
      if (!link || !link.success) {
        setState({ status: "error", message: link && !link.success ? link.error : "Upload failed. Try again." });
        return;
      }
      const { error } = await createClient()
        .storage.from(rules.bucket)
        .uploadToSignedUrl(link.path, link.token, file, { contentType: file.type });
      if (error) {
        setState({ status: "error", message: "Upload failed. Try again." });
        return;
      }
      onUploaded(link.path);
      setState({ status: "done", name: file.name });
    } finally {
      onUploading(false);
    }
  }

  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border-[1.5px] border-dashed border-ignite-edge/[0.18] bg-ignite-bg px-[15px] py-[11px]">
      <input type="file" accept={rules.accept} className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-ignite-lavender font-ui text-[10px] font-medium text-ignite-ink">
        {state.status === "uploading" ? <Spinner /> : kind === "deck" ? "PDF" : "ID"}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14px] font-semibold text-ignite-ink">
          {state.status === "uploading"
            ? `Uploading ${state.name}…`
            : state.status === "done"
              ? `New file ready: ${state.name} (replaces the current one on Save)`
              : label}
        </span>
        <span className={state.status === "error" ? "text-[12px] text-ignite-danger" : "text-[12px] text-ignite-muted"}>
          {state.status === "error" ? state.message : `Optional · ${rules.label}`}
        </span>
      </div>
    </label>
  );
}
