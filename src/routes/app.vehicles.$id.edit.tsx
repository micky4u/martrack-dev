import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { logChange } from "@/lib/audit";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/vehicles/$id/edit")({
  head: () => ({ meta: [{ title: "Editar vehículo · MarTrack PMV" }] }),
  component: EditVehicle,
});

function EditVehicle() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [muns, setMuns] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [original, setOriginal] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: m }, { data: emps }] = await Promise.all([
        supabase.from("vehicles").select("*").eq("id", id).single(),
        supabase.from("municipalities").select("id,name,active").order("name"),
        supabase.from("profiles").select("id,full_name,email,active").eq("active", true).order("full_name"),
      ]);
      setOriginal(v);
      setForm({ ...v, registration_date: v?.registration_date ?? "" });
      setMuns(m ?? []);
      setEmployees(emps ?? []);
    })();
  }, [id]);

  if (!form) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  const canEdit = role === "root" || role === "coordinador";
  if (!canEdit) return <div className="text-sm text-muted-foreground">Sin permisos para editar.</div>;

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.plate || !form.brand || !form.model) {
      toast.error("Completa matrícula, marca y modelo");
      return;
    }
    setBusy(true);
    const payload = {
      plate: form.plate, brand: form.brand, model: form.model, year: form.year,
      color: form.color, engine_type: form.engine_type, fuel: form.fuel,
      mileage: form.mileage, status: form.status,
      municipality_id: form.municipality_id || null,
      responsible_user_id: form.responsible_user_id || null,
      registration_date: form.registration_date || null,
      observations: form.observations,
    };
    const { error } = await supabase.from("vehicles").update(payload).eq("id", id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await logChange({
      entity_type: "vehicle", entity_id: id,
      action: original.status !== form.status ? "vehiculo_estado_cambiado" : "vehiculo_actualizado",
      before: original, after: payload,
      fields: Object.keys(payload),
    });
    toast.success("Vehículo actualizado");
    navigate({ to: "/app/vehicles/$id", params: { id } });
  };

  return (
    <div className="max-w-3xl space-y-5">
      <Link to="/app/vehicles/$id" params={{ id }} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3 mr-1" /> Volver al vehículo
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Editar vehículo</h1>
        <p className="text-sm text-muted-foreground mt-1 font-mono">{original?.plate}</p>
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Matrícula" required><Input value={form.plate ?? ""} onChange={(e) => set("plate", e.target.value)} required /></Field>
          <Field label="Marca" required><Input value={form.brand ?? ""} onChange={(e) => set("brand", e.target.value)} required /></Field>
          <Field label="Modelo" required><Input value={form.model ?? ""} onChange={(e) => set("model", e.target.value)} required /></Field>
          <Field label="Año"><Input type="number" value={form.year ?? ""} onChange={(e) => set("year", parseInt(e.target.value) || null)} /></Field>
          <Field label="Fecha matriculación"><Input type="date" value={form.registration_date ?? ""} onChange={(e) => set("registration_date", e.target.value)} /></Field>
          <Field label="Color"><Input value={form.color ?? ""} onChange={(e) => set("color", e.target.value)} /></Field>
          <Field label="Tipo de motor"><Input value={form.engine_type ?? ""} onChange={(e) => set("engine_type", e.target.value)} /></Field>
          <Field label="Combustible">
            <Select value={form.fuel ?? ""} onValueChange={(v) => set("fuel", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["gasolina", "diesel", "hibrido", "electrico", "glp"].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Kilometraje"><Input type="number" value={form.mileage ?? 0} onChange={(e) => set("mileage", parseInt(e.target.value) || 0)} /></Field>
          <Field label="Estado">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["disponible", "asignado", "en_revision", "baja"].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ayuntamiento">
            <Select value={form.municipality_id ?? "none"} onValueChange={(v) => set("municipality_id", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sin asignar —</SelectItem>
                {muns.filter(m => m.active).map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Responsable actual">
            <Select value={form.responsible_user_id ?? "none"} onValueChange={(v) => set("responsible_user_id", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sin asignar —</SelectItem>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Observaciones"><Textarea value={form.observations ?? ""} onChange={(e) => set("observations", e.target.value)} /></Field>
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/app/vehicles/$id", params: { id } })}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  );
}
