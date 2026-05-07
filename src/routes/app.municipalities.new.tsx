import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/municipalities/new")({
  head: () => ({ meta: [{ title: "Nuevo ayuntamiento · MarTrack PMV" }] }),
  component: NewMunicipality,
});

function NewMunicipality() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [form, setForm] = useState({ name: "", zone: "", internal_responsible: "", active: true });
  const [busy, setBusy] = useState(false);

  const canCreate = role === "root" || role === "coordinador";
  if (!canCreate) return <div className="text-sm text-muted-foreground">Sin permisos.</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setBusy(true);
    const { data, error } = await supabase.from("municipalities").insert(form).select("id").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({ entity_type: "municipality", entity_id: data.id, action: "ayuntamiento_creado", description: `Ayuntamiento creado: ${form.name}` });
    toast.success("Ayuntamiento creado");
    navigate({ to: "/app/municipalities" });
  };

  return (
    <div className="max-w-2xl space-y-5">
      <Link to="/app/municipalities" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3 mr-1" /> Volver
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Nuevo ayuntamiento</h1>
      <Card className="p-6">
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Nombre <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Zona</Label>
            <Input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Responsable interno</Label>
            <Input value={form.internal_responsible} onChange={(e) => setForm({ ...form, internal_responsible: e.target.value })} />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/app/municipalities" })}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Guardando…" : "Crear"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
