import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Car, ClipboardCheck, Image as ImageIcon, Building2 } from "lucide-react";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Dashboard · MarTrack PMV" }] }),
  component: Dashboard,
});

interface Stat { label: string; value: number; icon: React.ElementType; }

function Dashboard() {
  const [stats, setStats] = useState({
    total: 0, disp: 0, asig: 0, rev: 0,
    delPend: 0, delDone: 0, ev: 0, mun: 0,
  });
  const [recentDeliveries, setRecent] = useState<any[]>([]);
  const [recentVehicles, setRecentV] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [v, dPend, dDone, ev, mun, recDel, recV] = await Promise.all([
        supabase.from("vehicles").select("status", { count: "exact" }),
        supabase.from("vehicle_deliveries").select("id", { count: "exact", head: true }).neq("status", "cerrado").neq("status","firmado"),
        supabase.from("vehicle_deliveries").select("id", { count: "exact", head: true }).in("status", ["firmado","cerrado"]),
        supabase.from("vehicle_evidence").select("id", { count: "exact", head: true }),
        supabase.from("municipalities").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("vehicle_deliveries").select("id,status,created_at,vehicles(plate,brand,model)").order("created_at",{ascending:false}).limit(5),
        supabase.from("vehicles").select("id,plate,brand,model,status,updated_at,municipalities(name)").order("updated_at",{ascending:false}).limit(5),
      ]);
      const rows = v.data ?? [];
      setStats({
        total: v.count ?? rows.length,
        disp: rows.filter((r:any)=>r.status==="disponible").length,
        asig: rows.filter((r:any)=>r.status==="asignado").length,
        rev: rows.filter((r:any)=>r.status==="en_revision").length,
        delPend: dPend.count ?? 0,
        delDone: dDone.count ?? 0,
        ev: ev.count ?? 0,
        mun: mun.count ?? 0,
      });
      setRecent(recDel.data ?? []);
      setRecentV(recV.data ?? []);
    })();
  }, []);

  const cards: Stat[] = [
    { label: "Total vehículos", value: stats.total, icon: Car },
    { label: "Disponibles", value: stats.disp, icon: Car },
    { label: "Asignados", value: stats.asig, icon: Car },
    { label: "En revisión", value: stats.rev, icon: Car },
    { label: "Entregas pendientes", value: stats.delPend, icon: ClipboardCheck },
    { label: "Entregas completadas", value: stats.delDone, icon: ClipboardCheck },
    { label: "Evidencias subidas", value: stats.ev, icon: ImageIcon },
    { label: "Ayuntamientos activos", value: stats.mun, icon: Building2 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Resumen operativo de la flota</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <div className="flex items-center justify-between">
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-3 text-2xl font-semibold">{c.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Últimas entregas</h2>
            <Link to="/app/deliveries" className="text-xs text-muted-foreground hover:text-foreground">Ver todas →</Link>
          </div>
          <div className="space-y-2">
            {recentDeliveries.length === 0 && <p className="text-xs text-muted-foreground">Sin entregas todavía</p>}
            {recentDeliveries.map((d: any) => (
              <Link key={d.id} to="/app/deliveries/$id" params={{ id: d.id }} className="flex items-center justify-between text-sm p-2 rounded hover:bg-accent">
                <div>
                  <div className="font-medium">{d.vehicles?.plate}</div>
                  <div className="text-xs text-muted-foreground">{d.vehicles?.brand} {d.vehicles?.model}</div>
                </div>
                <StatusBadge status={d.status} />
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Vehículos actualizados</h2>
            <Link to="/app/vehicles" className="text-xs text-muted-foreground hover:text-foreground">Ver todos →</Link>
          </div>
          <div className="space-y-2">
            {recentVehicles.map((v: any) => (
              <Link key={v.id} to="/app/vehicles/$id" params={{ id: v.id }} className="flex items-center justify-between text-sm p-2 rounded hover:bg-accent">
                <div>
                  <div className="font-medium">{v.plate} · {v.brand} {v.model}</div>
                  <div className="text-xs text-muted-foreground">{v.municipalities?.name ?? "—"}</div>
                </div>
                <StatusBadge status={v.status} />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
