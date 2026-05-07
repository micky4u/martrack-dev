import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { logChange, logAudit } from "@/lib/audit";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/employees/$id")({
  head: () => ({ meta: [{ title: "Editar empleado · MarTrack PMV" }] }),
  component: EditEmployee,
});

function EditEmployee() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role: myRole } = useAuth();
  const [original, setOriginal] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [origRole, setOrigRole] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [muns, setMuns] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: m }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).single(),
        supabase.from("municipalities").select("id,name").eq("active", true).order("name"),
        supabase.from("user_roles").select("role").eq("user_id", id).maybeSingle(),
      ]);
      setOriginal(p);
      setForm({
        ...p,
        hire_date: p?.hire_date ?? "",
      });
      setMuns(m ?? []);
      setOrigRole(r?.role ?? null);
      setNewRole(r?.role ?? "supervisor");
    })();
  }, [id]);

  if (!form) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  const canEdit = myRole === "root" || myRole === "coordinador";
  const canEditRole = myRole === "root";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name?.trim()) { toast.error("Nombre obligatorio"); return; }
    setBusy(true);
    const payload = {
      full_name: form.full_name, phone: form.phone, position: form.position,
      municipality_id: form.municipality_id || null,
      hire_date: form.hire_date || null,
      driving_license: form.driving_license,
      observations: form.observations,
      active: form.active,
    };
    const { error } = await supabase.from("profiles").update(payload).eq("id", id);
    if (error) { setBusy(false); toast.error(error.message); return; }

    if (canEditRole && newRole && newRole !== origRole) {
      // Replace user role
      await supabase.from("user_roles").delete().eq("user_id", id);
      await supabase.from("user_roles").insert({ user_id: id, role: newRole as any });
      await logAudit({ entity_type: "user", entity_id: id, action: "rol_cambiado", description: `Rol: ${origRole ?? "—"} → ${newRole}` });
    }

    await logChange({
      entity_type: "employee", entity_id: id,
      action: original.active !== form.active
        ? (form.active ? "empleado_activado" : "empleado_desactivado")
        : "empleado_actualizado",
      before: original, after: payload,
    });
    setBusy(false);
    toast.success("Empleado actualizado");
    navigate({ to: "/app/employees" });
  };

  return (
    <div className="max-w-3xl space-y-5">
      <Link to="/app/employees" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3 mr-1" /> Volver
      </Link>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Editar empleado</h1>
          <p className="text-sm text-muted-foreground mt-1">{original?.email}</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{form.active ? "Activo" : "Inactivo"}</span>
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
          </div>
        )}
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nombre completo" required>
            <Input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} disabled={!canEdit} required />
          </Field>
          <Field label="Email">
            <Input value={form.email ?? ""} disabled />
          </Field>
          <Field label="Teléfono">
            <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!canEdit} />
          </Field>
          <Field label="Cargo / perfil operativo">
            <Input value={form.position ?? ""} onChange={(e) => setForm({ ...form, position: e.target.value })} disabled={!canEdit} />
          </Field>
          <Field label="Ayuntamiento asignado">
            <Select value={form.municipality_id ?? "none"} onValueChange={(v) => setForm({ ...form, municipality_id: v === "none" ? null : v })} disabled={!canEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sin asignar —</SelectItem>
                {muns.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fecha de ingreso">
            <Input type="date" value={form.hire_date ?? ""} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} disabled={!canEdit} />
          </Field>
          <Field label="Permiso de conducción">
            <Input placeholder="B, C, D…" value={form.driving_license ?? ""} onChange={(e) => setForm({ ...form, driving_license: e.target.value })} disabled={!canEdit} />
          </Field>
          <Field label="Rol del sistema">
            <Select value={newRole} onValueChange={setNewRole} disabled={!canEditRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["root", "gerencia", "coordinador", "supervisor"].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              </SelectContent>
            </Select>
            {!canEditRole && <p className="text-[11px] text-muted-foreground">Solo root puede cambiar roles globales.</p>}
          </Field>
          <div className="md:col-span-2">
            <Field label="Observaciones">
              <Textarea value={form.observations ?? ""} onChange={(e) => setForm({ ...form, observations: e.target.value })} disabled={!canEdit} />
            </Field>
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/app/employees" })}>Cancelar</Button>
            {canEdit && <Button type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</Button>}
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
