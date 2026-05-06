import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth-context";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/app/vehicles/")({
  head: () => ({ meta: [{ title: "Vehículos · MarTrack PMV" }] }),
  component: VehiclesList,
});

function VehiclesList() {
  const { role } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [muns, setMuns] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [mun, setMun] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [fuel, setFuel] = useState<string>("all");

  useEffect(() => {
    supabase.from("municipalities").select("id,name").order("name").then(({data}) => setMuns(data ?? []));
    supabase.from("vehicles").select("*, municipalities(name)").order("updated_at",{ascending:false})
      .then(({data}) => setRows(data ?? []));
  }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (q && !`${r.plate} ${r.brand} ${r.model}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (mun !== "all" && r.municipality_id !== mun) return false;
    if (status !== "all" && r.status !== status) return false;
    if (fuel !== "all" && r.fuel !== fuel) return false;
    return true;
  }), [rows, q, mun, status, fuel]);

  const canCreate = role === "root" || role === "coordinador";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vehículos</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} de {rows.length} registros</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link to="/app/vehicles/new"><Plus className="h-4 w-4 mr-1" /> Nuevo vehículo</Link>
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input placeholder="Buscar matrícula, marca, modelo…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={mun} onValueChange={setMun}>
            <SelectTrigger><SelectValue placeholder="Ayuntamiento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los ayuntamientos</SelectItem>
              {muns.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="disponible">Disponible</SelectItem>
              <SelectItem value="asignado">Asignado</SelectItem>
              <SelectItem value="en_revision">En revisión</SelectItem>
              <SelectItem value="baja">Baja</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fuel} onValueChange={setFuel}>
            <SelectTrigger><SelectValue placeholder="Combustible" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="gasolina">Gasolina</SelectItem>
              <SelectItem value="diesel">Diésel</SelectItem>
              <SelectItem value="hibrido">Híbrido</SelectItem>
              <SelectItem value="electrico">Eléctrico</SelectItem>
              <SelectItem value="glp">GLP</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-normal">Matrícula</th>
                <th className="text-left px-4 py-2 font-normal">Marca / Modelo</th>
                <th className="text-left px-4 py-2 font-normal">Año</th>
                <th className="text-left px-4 py-2 font-normal">Ayuntamiento</th>
                <th className="text-left px-4 py-2 font-normal">Estado</th>
                <th className="text-left px-4 py-2 font-normal">Actualizado</th>
                <th className="text-right px-4 py-2 font-normal">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-4 py-3 font-mono">{r.plate}</td>
                  <td className="px-4 py-3">{r.brand} {r.model}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.year ?? "—"}</td>
                  <td className="px-4 py-3">{r.municipalities?.name ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(r.updated_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/app/vehicles/$id" params={{ id: r.id }} className="text-xs underline-offset-4 hover:underline">Ver detalle</Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
