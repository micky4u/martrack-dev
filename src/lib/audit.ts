import { supabase } from "@/integrations/supabase/client";

export async function logAudit(opts: {
  entity_type: string;
  entity_id?: string | null;
  action: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return; // policy now requires user_id = auth.uid(); skip if not signed in
  await supabase.from("audit_log").insert({
    user_id: user.id,
    entity_type: opts.entity_type,
    entity_id: opts.entity_id ?? null,
    action: opts.action,
    description: opts.description ?? null,
    metadata: (opts.metadata ?? null) as never,
  });
}

/**
 * Diff two records and log a single audit event with old→new values.
 */
export async function logChange(opts: {
  entity_type: string;
  entity_id: string;
  action: string;
  before: Record<string, any>;
  after: Record<string, any>;
  fields?: string[];
}) {
  const fields = opts.fields ?? Object.keys(opts.after);
  const changes: Record<string, { old: any; new: any }> = {};
  for (const f of fields) {
    const a = opts.before?.[f];
    const b = opts.after?.[f];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes[f] = { old: a ?? null, new: b ?? null };
    }
  }
  if (Object.keys(changes).length === 0) return;
  const desc = Object.entries(changes)
    .map(([k, v]) => `${k}: ${JSON.stringify(v.old)} → ${JSON.stringify(v.new)}`)
    .join("; ");
  await logAudit({
    entity_type: opts.entity_type,
    entity_id: opts.entity_id,
    action: opts.action,
    description: desc,
    metadata: changes as never,
  });
}
