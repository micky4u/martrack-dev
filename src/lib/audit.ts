import { supabase } from "@/integrations/supabase/client";

export async function logAudit(opts: {
  entity_type: string;
  entity_id?: string | null;
  action: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("audit_log").insert({
    user_id: user?.id ?? null,
    entity_type: opts.entity_type,
    entity_id: opts.entity_id ?? null,
    action: opts.action,
    description: opts.description ?? null,
    metadata: (opts.metadata ?? null) as never,
  });
}
