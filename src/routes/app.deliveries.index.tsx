import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth-context";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/app/deliveries/")({
  head: () => ({ meta: [{ title: "Entregas · MarTrack PMV" }] }),
  component: DeliveriesList,
});

function DeliveriesList() {
  const { role, user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [pickVehicle, setPickVehicle] = useState<string>("");
  const navigate = useNavigate();

  const load = () => {
    supabase.from("vehicle_deliveries")
      .select("id,status,created_at,signed_at,vehicles(plate,brand,model)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  };
  useEffect(() => {
    load();
    supabase.from("vehicles").select("id,plate,brand,model").order("plate").then(({ data }) => setVehicles(data ?? []));
  }, []);

  const canManage = role === "root" || role === "coordinador";

  const create = async () => {
    if (!pickVehicle || !user) { toast.error("Selecciona un vehículo"); return; }
    setCreating(true);
    const { data, error } = await supabase.from("vehicle_deliveries").insert({
      vehicle_id: pickVehicle, created_by: user.id, status: "evidencias_pendientes",
    }).select("id,vehicles(plate)").single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({ entity_type: "delivery", entity_id: data.id, action: "entrega_creada", description: `Entrega para ${(data as any).vehicles?.plate}` });
    toast.success("Entrega creada");
    navigate({ to: "/app/deliveries/$id", params: { id: data.id } });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Entregas</h1>
          <p className="text-sm text-muted-foreground mt-1">{rows.length} entregas</p>
        </div>
      </div>

      {canManage && (
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs">Vehículo a entregar</label>
              <Select value={pickVehicle} onValueChange={setPickVehicle}>
                <SelectTrigger><SelectValue placeholder="Seleccionar vehículo…" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.plate} · {v.brand} {v.model}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={create} disabled={creating || !pickVehicle}>
              <Plus className="h-4 w-4 mr-1" /> {creating ? "Creando…" : "Nueva entrega"}
            </Button>
          </div>
        </Card>
      )}

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
                  <Link to="/app/deliveries/$id" params={{ id: r.id }} className="hover:underline underline-offset-4">{r.id.slice(0, 8)}</Link>
                </td>
                <td className="px-4 py-3">{r.vehicles?.plate} · {r.vehicles?.brand} {r.vehicles?.model}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
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
