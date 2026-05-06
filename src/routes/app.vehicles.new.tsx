import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect } from "react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/app/vehicles/new")({
  head: () => ({ meta: [{ title: "Nuevo vehículo · MarTrack PMV" }] }),
  component: NewVehicle,
});

function NewVehicle() {
  const navigate = useNavigate();
  const [muns, setMuns] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    plate: "", brand: "", model: "", year: new Date().getFullYear(),
    color: "", engine_type: "", fuel: "diesel", mileage: 0,
    status: "disponible", municipality_id: "", observations: "",
    registration_date: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("municipalities").select("id,name").order("name").then(({data}) => setMuns(data ?? []));
  }, []);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const payload = { ...form, municipality_id: form.municipality_id || null, registration_date: form.registration_date || null };
    const { data, error } = await supabase.from("vehicles").insert(payload).select("id").single();
    setBusy(false);
    if (error) { toast.error("Error al crear", { description: error.message }); return; }
    await logAudit({ entity_type: "vehicle", entity_id: data.id, action: "create", description: `Vehículo ${form.plate} creado` });
    toast.success("Vehículo creado");
    navigate({ to: "/app/vehicles/$id", params: { id: data.id } });
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo vehículo</h1>
        <p className="text-sm text-muted-foreground mt-1">Registra un vehículo en la flota</p>
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Matrícula" required><Input value={form.plate} onChange={(e)=>set("plate",e.target.value)} required /></Field>
          <Field label="Marca" required><Input value={form.brand} onChange={(e)=>set("brand",e.target.value)} required /></Field>
          <Field label="Modelo" required><Input value={form.model} onChange={(e)=>set("model",e.target.value)} required /></Field>
          <Field label="Año"><Input type="number" value={form.year} onChange={(e)=>set("year",parseInt(e.target.value)||null)} /></Field>
          <Field label="Fecha matriculación"><Input type="date" value={form.registration_date} onChange={(e)=>set("registration_date",e.target.value)} /></Field>
          <Field label="Color"><Input value={form.color} onChange={(e)=>set("color",e.target.value)} /></Field>
          <Field label="Tipo de motor"><Input value={form.engine_type} onChange={(e)=>set("engine_type",e.target.value)} /></Field>
          <Field label="Combustible">
            <Select value={form.fuel} onValueChange={(v)=>set("fuel",v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["gasolina","diesel","hibrido","electrico","glp"].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Kilometraje"><Input type="number" value={form.mileage} onChange={(e)=>set("mileage",parseInt(e.target.value)||0)} /></Field>
          <Field label="Estado">
            <Select value={form.status} onValueChange={(v)=>set("status",v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["disponible","asignado","en_revision","baja"].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ayuntamiento">
            <Select value={form.municipality_id} onValueChange={(v)=>set("municipality_id",v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar"/></SelectTrigger>
              <SelectContent>
                {muns.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Observaciones"><Textarea value={form.observations} onChange={(e)=>set("observations",e.target.value)} /></Field>
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={()=>navigate({to:"/app/vehicles"})}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy?"Guardando…":"Crear vehículo"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({label,children,required}:{label:string;children:React.ReactNode;required?:boolean}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  );
}
