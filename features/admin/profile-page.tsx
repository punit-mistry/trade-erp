"use client";

import { useMutation } from "convex/react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/convex/lib/roles";
import { FormField } from "@/components/shared/form-field";
import { PageHeader } from "@/components/shared/page-header";
import { DetailList, Section } from "@/components/shared/section";
import { PageSkeleton } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useViewer } from "@/hooks/use-viewer";
import { getErrorMessage } from "@/lib/errors";
import { USER_STATUS } from "@/lib/status";

type Viewer = NonNullable<ReturnType<typeof useViewer>["viewer"]>;

export function ProfilePage() {
  const { viewer } = useViewer();
  if (!viewer) return <PageSkeleton />;
  return <ProfileView key={viewer._id} viewer={viewer} />;
}

function ProfileView({ viewer }: { viewer: Viewer }) {
  const updateProfile = useMutation(api.users.updateProfile);
  const [name, setName] = useState(viewer.name ?? "");
  const [title, setTitle] = useState(viewer.title ?? "");
  const [saving, setSaving] = useState(false);

  const dirty = name !== (viewer.name ?? "") || title !== (viewer.title ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ name, title });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="My profile" description="Your name and title appear in activity history and on records you create." />
      <Section title="Personal details">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <FormField label="Full name" htmlFor="pf-name" required>
            <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </FormField>
          <FormField label="Job title" htmlFor="pf-title">
            <Input id="pf-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Trade Operations Executive" />
          </FormField>
          <FormField label="Email" htmlFor="pf-email" help="Your sign-in email cannot be changed here." className="sm:col-span-2">
            <Input id="pf-email" value={viewer.email ?? ""} disabled />
          </FormField>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={!dirty || saving}>
              {saving && <Loader2 className="animate-spin" />}
              Save profile
            </Button>
          </div>
        </form>
      </Section>
      <Section
        title={
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-primary" /> Access
          </span>
        }
        description="Roles and status are managed by administrators in Team & Access. You cannot change your own role."
      >
        <DetailList
          columns={3}
          items={[
            { label: "Role", value: viewer.role ? ROLE_LABELS[viewer.role] : "—" },
            { label: "Status", value: <StatusBadge value={viewer.status} map={USER_STATUS} /> },
            { label: "Extra grants", value: viewer.grants.length ? viewer.grants.join(", ") : "—" },
            { label: "What your role can do", value: viewer.role ? ROLE_DESCRIPTIONS[viewer.role] : "—", span: 3 },
          ]}
        />
      </Section>
    </div>
  );
}
