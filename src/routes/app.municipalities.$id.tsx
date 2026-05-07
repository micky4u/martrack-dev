import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { logChange, logAudit } from "@/lib/audit";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/municipalities/$id")({
  head: () => ({ meta: [{ title: "Editar ayuntamiento · MarTrack PMV" }] }),
  component: EditMunicipality,
});

function EditMunicipality() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [original, setOriginal] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("municipalities").select("*").eq("id", id).single().then(({ data }) => {
      setOriginal(data); setForm(data);
    });
  }, [id]);

  if (!form) return <div className="text-sm text-muted-foreground">Cargando…</div>;
  const canEdit = role === "root" || role === "coordinador";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) { toast.error("Nombre obligatorio"); return; }
    setBusy(true);
    const payload = { name: form.name, zone: form.zone, internal_responsible: form.internal_responsible, active: form.active };
    const { error } = await supabase.from("municipalities").update(payload).eq("id", id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await logChange({
      entity_type: "municipality", entity_id: id,
      action: original.active !== form.active
        ? (form.active ? "ayuntamiento_activado" : "ayuntamiento_desactivado")
        : "ayuntamiento_actualizado",
      before: original, after: payload,
    });
    toast.success("Ayuntamiento actualizado");
    navigate({ to: "/app/municipalities" });
  };

  const toggleActive = async () => {
    const next = !form.active;
    await supabase.from("municipalities").update({ active: next }).eq("id", id);
    await logAudit({ entity_type: "municipality", entity_id: id, action: next ? "ayuntamiento_activado" : "ayuntamiento_desactivado" });
    setForm({ ...form, active: next });
    toast.success(next ? "Activado" : "Desactivado");
  };

  return (
    <div className="max-w-2xl space-y-5">
      <Link to="/app/municipalities" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3 mr-1" /> Volver
      </Link>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Editar ayuntamiento</h1>
          <p className="text-sm text-muted-foreground mt-1">{original?.name}</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{form.active ? "Activo" : "Inactivo"}</span>
            <Switch checked={form.active} onCheckedChange={toggleActive} />
          </div>
        )}
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Nombre <span className="text-destructive">*</span></Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEdit} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Zona</Label>
            <Input value={form.zone ?? ""} onChange={(e) => setForm({ ...form, zone: e.target.value })} disabled={!canEdit} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Responsable interno</Label>
            <Input value={form.internal_responsible ?? ""} onChange={(e) => setForm({ ...form, internal_responsible: e.target.value })} disabled={!canEdit} />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/app/municipalities" })}>Cancelar</Button>
            {canEdit && <Button type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</Button>}
          </div>
        </form>
      </Card>
    </div>
  );
}
