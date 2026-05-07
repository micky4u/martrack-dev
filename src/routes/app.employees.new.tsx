import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/employees/new")({
  head: () => ({ meta: [{ title: "Nuevo empleado · MarTrack PMV" }] }),
  component: NewEmployee,
});

function NewEmployee() {
  const navigate = useNavigate();
  const { role: myRole } = useAuth();
  const [muns, setMuns] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    email: "", password: "", full_name: "", phone: "", position: "",
    municipality_id: "", hire_date: "", driving_license: "", observations: "",
    role: "supervisor",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("municipalities").select("id,name").eq("active", true).order("name").then(({ data }) => setMuns(data ?? []));
  }, []);

  const canManage = myRole === "root" || myRole === "coordinador";
  if (!canManage) return <div className="text-sm text-muted-foreground">Sin permisos.</div>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.full_name) {
      toast.error("Email, contraseña y nombre son obligatorios"); return;
    }
    if (form.password.length < 6) { toast.error("Contraseña mínima 6 caracteres"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-employee", {
      body: {
        ...form,
        municipality_id: form.municipality_id || null,
        hire_date: form.hire_date || null,
      },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Error");
      return;
    }
    toast.success("Empleado creado");
    navigate({ to: "/app/employees" });
  };

  return (
    <div className="max-w-3xl space-y-5">
      <Link to="/app/employees" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3 mr-1" /> Volver
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Nuevo empleado</h1>
      <Card className="p-6">
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nombre completo" required><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></Field>
          <Field label="Email" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label="Contraseña inicial" required><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
          <Field label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Cargo / perfil operativo"><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></Field>
          <Field label="Ayuntamiento">
            <Select value={form.municipality_id || "none"} onValueChange={(v) => setForm({ ...form, municipality_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sin asignar —</SelectItem>
                {muns.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fecha de ingreso"><Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></Field>
          <Field label="Permiso de conducción"><Input placeholder="B, C, D…" value={form.driving_license} onChange={(e) => setForm({ ...form, driving_license: e.target.value })} /></Field>
          <Field label="Rol">
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })} disabled={myRole !== "root"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(myRole === "root"
                  ? ["root", "gerencia", "coordinador", "supervisor"]
                  : ["supervisor"]
                ).map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
              </SelectContent>
            </Select>
            {myRole !== "root" && <p className="text-[11px] text-muted-foreground">Coordinador solo puede crear supervisores.</p>}
          </Field>
          <div className="md:col-span-2"><Field label="Observaciones"><Textarea value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} /></Field></div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate({ to: "/app/employees" })}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creando…" : "Crear empleado"}</Button>
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
