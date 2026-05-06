import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/app/audit/")({
  head: () => ({ meta: [{ title: "Auditoría · MarTrack PMV" }] }),
  component: AuditPage,
});

function AuditPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("audit_log").select("*").order("created_at",{ascending:false}).limit(200)
      .then(({data}) => setRows(data ?? []));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoría / Historial</h1>
        <p className="text-sm text-muted-foreground mt-1">Trazabilidad de eventos del sistema</p>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-normal">Fecha</th>
              <th className="text-left px-4 py-2 font-normal">Entidad</th>
              <th className="text-left px-4 py-2 font-normal">Acción</th>
              <th className="text-left px-4 py-2 font-normal">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3">{r.entity_type}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.description ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">Sin eventos</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
