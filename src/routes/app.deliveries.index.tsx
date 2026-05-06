import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/app/deliveries/")({
  head: () => ({ meta: [{ title: "Entregas · MarTrack PMV" }] }),
  component: DeliveriesList,
});

function DeliveriesList() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("vehicle_deliveries")
      .select("id,status,created_at,signed_at,vehicles(plate,brand,model)")
      .order("created_at",{ascending:false})
      .then(({data}) => setRows(data ?? []));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Entregas</h1>
        <p className="text-sm text-muted-foreground mt-1">{rows.length} entregas</p>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-normal">Entrega</th>
              <th className="text-left px-4 py-2 font-normal">Vehículo</th>
              <th className="text-left px-4 py-2 font-normal">Estado</th>
              <th className="text-left px-4 py-2 font-normal">Creada</th>
              <th className="text-left px-4 py-2 font-normal">Firmada</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border hover:bg-accent/40">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link to="/app/deliveries/$id" params={{id:r.id}} className="hover:underline underline-offset-4">{r.id.slice(0,8)}</Link>
                </td>
                <td className="px-4 py-3">{r.vehicles?.plate} · {r.vehicles?.brand} {r.vehicles?.model}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status}/></td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.signed_at ? new Date(r.signed_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Sin entregas</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
