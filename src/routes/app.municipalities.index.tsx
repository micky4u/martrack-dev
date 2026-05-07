import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/municipalities/")({
  head: () => ({ meta: [{ title: "Ayuntamientos · MarTrack PMV" }] }),
  component: Municipalities,
});

function Municipalities() {
  const { role } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data: muns } = await supabase.from("municipalities").select("*").order("name");
      const { data: vehs } = await supabase.from("vehicles").select("municipality_id");
      const counts = (vehs ?? []).reduce<Record<string, number>>((acc, v: any) => {
        if (v.municipality_id) acc[v.municipality_id] = (acc[v.municipality_id] ?? 0) + 1;
        return acc;
      }, {});
      setRows((muns ?? []).map((m: any) => ({ ...m, vehicleCount: counts[m.id] ?? 0 })));
    })();
  }, []);

  const canManage = role === "root" || role === "coordinador";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ayuntamientos</h1>
          <p className="text-sm text-muted-foreground mt-1">{rows.length} ayuntamientos</p>
        </div>
        {canManage && (
          <Button asChild>
            <Link to="/app/municipalities/new"><Plus className="h-4 w-4 mr-1" /> Nuevo ayuntamiento</Link>
          </Button>
        )}
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((m) => (
          <Card key={m.id} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{m.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{m.zone ?? "—"}</p>
              </div>
              <Badge variant={m.active ? "outline" : "secondary"} className={m.active ? "border-success/40 text-success" : ""}>
                {m.active ? "Activo" : "Inactivo"}
              </Badge>
            </div>
            <div className="mt-4 pt-3 border-t border-border text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Responsable</span><span>{m.internal_responsible ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Vehículos</span>
                <Link to="/app/vehicles" className="font-medium hover:underline underline-offset-4">{m.vehicleCount}</Link>
              </div>
            </div>
            {canManage && (
              <div className="mt-3 pt-3 border-t border-border flex justify-end">
                <Button asChild size="sm" variant="outline">
                  <Link to="/app/municipalities/$id" params={{ id: m.id }}><Pencil className="h-3 w-3 mr-1" /> Editar</Link>
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
