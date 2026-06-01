import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth-context";
import { ASSIGNMENT_ACTIVE_STATUSES, canManageAssignments } from "@/lib/rbac";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/app/deliveries/")({
  head: () => ({ meta: [{ title: "Asignaciones · MarTrack PMV" }] }),
  component: DeliveriesList,
});

type Person = {
  id: string;
  email: string | null;
  full_name: string | null;
  position: string | null;
  role: string;
};

function displayPerson(p?: Person | null) {
  if (!p) return "—";
  return [p.full_name || p.email, p.position].filter(Boolean).join(" · ");
}

function DeliveriesList() {
  const { role, user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [creating, setCreating] = useState(false);
  const [pickVehicle, setPickVehicle] = useState<string>("");
  const [pickSupervisor, setPickSupervisor] = useState<string>("");
  const [pickEmployee, setPickEmployee] = useState<string>("");
  const navigate = useNavigate();

  const canManage = canManageAssignments(role);

  const loadRows = async () => {
    const { data } = await supabase
      .from("vehicle_deliveries")
      .select("id,status,created_at,signed_at,assignment_locked,vehicle_id,supervisor_id,assigned_employee_id,vehicles(plate,brand,model)")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
  };

  const loadPeople = async () => {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,email,full_name,position,active")
      .eq("active", true)
      .order("full_name");

    const base = (profs ?? []) as Array<Omit<Person, "role"> & { active: boolean }>;
    if (!base.length) {
      setPeople([]);
      return;
    }

    const { data: overview } = await supabase.functions.invoke("manage-user-access", {
      body: { action: "list_access_overview", ids: base.map((p) => p.id) },
    });
    const roleMap = new Map<string, string>(((overview as any)?.users ?? []).map((u: any) => [u.id, u.role ?? "empleado"]));
    setPeople(base.map((p) => ({ ...p, role: roleMap.get(p.id) ?? "empleado" })));
  };

  const loadEligibleVehicles = async () => {
    const [{ data: vs }, { data: activeDeliveries }] = await Promise.all([
      supabase.from("vehicles").select("id,plate,brand,model,status").eq("status", "disponible").order("plate"),
      supabase.from("vehicle_deliveries").select("vehicle_id").in("status", [...ASSIGNMENT_ACTIVE_STATUSES]),
    ]);
    const blocked = new Set((activeDeliveries ?? []).map((d: any) => d.vehicle_id));
    setVehicles((vs ?? []).filter((v: any) => !blocked.has(v.id)));
  };

  const load = async () => {
    await Promise.all([loadRows(), loadEligibleVehicles(), canManage ? loadPeople() : Promise.resolve()]);
  };

  useEffect(() => { load(); }, [canManage]);

  const supervisors = people.filter((p) => p.role === "supervisor" || p.role === "coordinador");
  const employees = people.filter((p) => p.role === "empleado" || p.role === "supervisor");
  const peopleById = new Map(people.map((p) => [p.id, p]));

  const create = async () => {
    if (!pickVehicle || !pickSupervisor || !user) {
      toast.error("Selecciona vehículo y supervisor.");
      return;
    }
    setCreating(true);

    const [{ data: vCheck }, { count: activeCount }] = await Promise.all([
      supabase.from("vehicles").select("status").eq("id", pickVehicle).single(),
      supabase.from("vehicle_deliveries").select("id", { count: "exact", head: true }).eq("vehicle_id", pickVehicle).in("status", [...ASSIGNMENT_ACTIVE_STATUSES]),
    ]);

    if (vCheck?.status !== "disponible" || (activeCount ?? 0) > 0) {
      setCreating(false);
      toast.error("Ese vehículo ya no es elegible: no está disponible o ya tiene una asignación activa.");
      setPickVehicle("");
      await loadEligibleVehicles();
      return;
    }

    const { data, error } = await supabase
      .from("vehicle_deliveries")
      .insert({
        vehicle_id: pickVehicle,
        supervisor_id: pickSupervisor,
        assigned_employee_id: pickEmployee || null,
        created_by: user.id,
        status: "pendiente_firma",
      } as any)
      .select("id,vehicles(plate)")
      .single();

    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    await logAudit({
      entity_type: "delivery",
      entity_id: data.id,
      action: "asignacion_creada",
      description: `Asignación creada para ${(data as any).vehicles?.plate}`,
      metadata: { supervisor_id: pickSupervisor, assigned_employee_id: pickEmployee || null } as never,
    });
    toast.success("Asignación creada y enviada al supervisor para firma");
    navigate({ to: "/app/deliveries/$id", params: { id: data.id } });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Asignaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">{rows.length} asignaciones</p>
        </div>
      </div>

      {canManage && (
        <Card className="p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Nueva asignación coordinada</h2>
            <p className="text-xs text-muted-foreground mt-1">Un solo flujo: vehículo → supervisor → empleado/equipo opcional → firma móvil del supervisor.</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 lg:items-end">
            <Field label="Vehículo disponible">
              <Select value={pickVehicle} onValueChange={setPickVehicle} disabled={vehicles.length === 0}>
                <SelectTrigger><SelectValue placeholder={vehicles.length === 0 ? "Sin vehículos libres" : "Seleccionar vehículo"} /></SelectTrigger>
                <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.plate} · {v.brand} {v.model}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Supervisor responsable">
              <Select value={pickSupervisor} onValueChange={setPickSupervisor} disabled={supervisors.length === 0}>
                <SelectTrigger><SelectValue placeholder={supervisors.length === 0 ? "Sin supervisores" : "Seleccionar supervisor"} /></SelectTrigger>
                <SelectContent>{supervisors.map((p) => <SelectItem key={p.id} value={p.id}>{displayPerson(p)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Empleado / equipo a cargo">
              <Select value={pickEmployee || "none"} onValueChange={(v) => setPickEmployee(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin empleado concreto —</SelectItem>
                  {employees.map((p) => <SelectItem key={p.id} value={p.id}>{displayPerson(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Button onClick={create} disabled={creating || !pickVehicle || !pickSupervisor}>
              <Plus className="h-4 w-4 mr-1" /> {creating ? "Creando…" : "Crear asignación"}
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-normal">Asignación</th>
              <th className="text-left px-4 py-2 font-normal">Vehículo</th>
              <th className="text-left px-4 py-2 font-normal">Supervisor</th>
              <th className="text-left px-4 py-2 font-normal">Empleado/equipo</th>
              <th className="text-left px-4 py-2 font-normal">Estado</th>
              <th className="text-left px-4 py-2 font-normal">Creada</th>
              <th className="text-left px-4 py-2 font-normal">Firmada</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-accent/40">
                <td className="px-4 py-3 font-mono text-xs"><Link to="/app/deliveries/$id" params={{ id: r.id }} className="hover:underline underline-offset-4">{r.id.slice(0, 8)}</Link></td>
                <td className="px-4 py-3">{r.vehicles?.plate} · {r.vehicles?.brand} {r.vehicles?.model}</td>
                <td className="px-4 py-3">{displayPerson(peopleById.get(r.supervisor_id))}</td>
                <td className="px-4 py-3">{displayPerson(peopleById.get(r.assigned_employee_id))}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.signed_at ? new Date(r.signed_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Sin asignaciones</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="text-xs">{label}</label>{children}</div>;
}
