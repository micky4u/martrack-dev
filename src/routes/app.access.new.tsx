import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/access/new")({
  head: () => ({ meta: [{ title: "Nuevo empleado con acceso · MarTrack PMV" }] }),
  component: NewAccess,
});

function NewAccess() {
  const navigate = useNavigate();
  const { role: myRole } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [muns, setMuns] = useState<any[]>([]);
  const [withAccess, setWithAccess] = useState(true);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    full_name: "", first_name: "", last_name: "", document_id: "",
    birth_date: "", hire_date: "", phone: "", personal_email: "",
    municipality_id: "", department: "", position: "", profile_op: "",
    employee_active: true, can_drive: false, driving_license: "",
    license_expiry: "", observations: "",
    // access
    email: "", password: "", password2: "",
    role: "empleado", access_status: "active",
    must_change_password: false,
  });

  useEffect(() => {
    supabase.from("municipalities").select("id,name").eq("active", true).order("name").then(({ data }) => setMuns(data ?? []));
  }, []);

  if (myRole !== "root" && myRole !== "coordinador") {
    return <div className="text-sm text-muted-foreground">Sin permisos.</div>;
  }
  const isRoot = myRole === "root";

  const validateStep1 = () => {
    if (!form.full_name && !(form.first_name || form.last_name)) {
      toast.error("Indica al menos nombre o apellidos."); return false;
    }
    return true;
  };
  const validateStep2 = () => {
    if (!withAccess) return true;
    if (!form.email || !form.email.includes("@")) { toast.error("Email de acceso inválido."); return false; }
    if (!form.password || form.password.length < 8) { toast.error("La contraseña debe tener al menos 8 caracteres."); return false; }
    if (form.password !== form.password2) { toast.error("Las contraseñas no coinciden."); return false; }
    if (!form.role) { toast.error("Selecciona un rol antes de crear el acceso."); return false; }
    if (!isRoot && form.role === "root") { toast.error("Coordinador no puede crear usuarios Root."); return false; }
    return true;
  };

  const submit = async () => {
    setBusy(true);
    const fullName = form.full_name || `${form.first_name} ${form.last_name}`.trim();

    if (!withAccess) {
      // Empleado sin acceso real: no podemos crear profile sin auth.users (FK).
      toast.error("Por ahora todo empleado requiere credenciales (creamos un acceso bloqueado).");
      setBusy(false); return;
    }

    const { data, error } = await supabase.functions.invoke("create-employee", {
      body: {
        email: form.email, password: form.password, full_name: fullName,
        phone: form.phone, position: form.position,
        municipality_id: form.municipality_id || null,
        hire_date: form.hire_date || null,
        driving_license: form.driving_license,
        observations: [
          form.observations,
          form.document_id && `DNI/NIE: ${form.document_id}`,
          form.birth_date && `Nac.: ${form.birth_date}`,
          form.department && `Depto: ${form.department}`,
          form.profile_op && `Perfil op.: ${form.profile_op}`,
          form.license_expiry && `Permiso vence: ${form.license_expiry}`,
        ].filter(Boolean).join(" · "),
        role: form.role,
      },
    });

    if (error || (data as any)?.error) {
      const msg = (data as any)?.error ?? error?.message ?? "";
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
        toast.error("El email ya está registrado como usuario de acceso.");
      } else {
        toast.error(msg || "No se pudo crear el usuario de autenticación. Revisa la configuración.");
      }
      setBusy(false); return;
    }

    const newId = (data as any).id as string;

    // Apply post-create flags (block, force pwd change)
    const ops: Promise<any>[] = [];
    if (form.access_status === "blocked") {
      ops.push(supabase.functions.invoke("manage-user-access", { body: { action: "ban", target_user_id: newId } }));
    } else if (form.access_status === "inactive") {
      ops.push(supabase.functions.invoke("manage-user-access", { body: { action: "disable_employee", target_user_id: newId, reason: "Creado como inactivo" } }));
    }
    if (form.must_change_password) {
      ops.push(supabase.functions.invoke("manage-user-access", { body: { action: "force_password_change", target_user_id: newId } }));
    }
    await Promise.all(ops);

    toast.success("Empleado y acceso creados");
    setBusy(false);
    navigate({ to: "/app/access" });
  };

  return (
    <div className="max-w-3xl space-y-5">
      <Link to="/app/access" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3 mr-1" /> Volver
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo empleado con acceso</h1>
        <div className="flex items-center gap-2 text-xs">
          {[1, 2, 3].map(n => (
            <Badge key={n} variant={step === n ? "default" : "outline"}>{n}</Badge>
          ))}
        </div>
      </div>

      {step === 1 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">1 · Datos personales y laborales</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombres"><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></Field>
            <Field label="Apellidos"><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></Field>
            <Field label="Nombre completo (opcional)"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="DNI / NIE (ficticio)"><Input value={form.document_id} onChange={(e) => setForm({ ...form, document_id: e.target.value })} /></Field>
            <Field label="Fecha de nacimiento"><Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></Field>
            <Field label="Fecha de ingreso"><Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></Field>
            <Field label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email personal"><Input type="email" value={form.personal_email} onChange={(e) => setForm({ ...form, personal_email: e.target.value, email: form.email || e.target.value })} /></Field>
            <Field label="Ayuntamiento">
              <Select value={form.municipality_id || "none"} onValueChange={(v) => setForm({ ...form, municipality_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin asignar —</SelectItem>
                  {muns.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Departamento"><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></Field>
            <Field label="Cargo"><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></Field>
            <Field label="Perfil operativo"><Input value={form.profile_op} onChange={(e) => setForm({ ...form, profile_op: e.target.value })} /></Field>
            <Field label="Permiso conducción"><Input value={form.driving_license} onChange={(e) => setForm({ ...form, driving_license: e.target.value, can_drive: !!e.target.value })} placeholder="B, C, D…" /></Field>
            <Field label="Vencimiento permiso"><Input type="date" value={form.license_expiry} onChange={(e) => setForm({ ...form, license_expiry: e.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="Observaciones"><Textarea value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} /></Field></div>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => navigate({ to: "/app/access" })}>Cancelar</Button>
            <Button onClick={() => { if (validateStep1()) setStep(2); }}>Siguiente <ChevronRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">2 · Acceso al sistema</h2>
          <div className="flex items-center justify-between p-3 rounded border">
            <div>
              <div className="text-sm font-medium">Crear acceso al sistema</div>
              <div className="text-xs text-muted-foreground">El usuario podrá iniciar sesión con email y contraseña.</div>
            </div>
            <Switch checked={withAccess} onCheckedChange={setWithAccess} />
          </div>
          {withAccess && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Email de acceso" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Rol del sistema" required>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(isRoot ? ["root", "coordinador", "supervisor", "empleado"] : ["coordinador", "supervisor", "empleado"]).map(x => (
                      <SelectItem key={x} value={x}>{x}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Contraseña inicial" required><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
              <Field label="Confirmar contraseña" required><Input type="password" value={form.password2} onChange={(e) => setForm({ ...form, password2: e.target.value })} /></Field>
              <Field label="Estado de acceso">
                <Select value={form.access_status} onValueChange={(v) => setForm({ ...form, access_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
                    <SelectItem value="blocked">Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.must_change_password} onCheckedChange={(v) => setForm({ ...form, must_change_password: v })} />
                <span className="text-sm">Forzar cambio de contraseña en primer inicio</span>
              </div>
            </div>
          )}
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4 mr-1" /> Atrás</Button>
            <Button onClick={() => { if (validateStep2()) setStep(3); }}>Siguiente <ChevronRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6 space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">3 · Confirmación</h2>
          <div className="rounded border divide-y text-sm">
            <Row k="Empleado" v={form.full_name || `${form.first_name} ${form.last_name}`.trim()} />
            <Row k="Cargo" v={form.position || "—"} />
            <Row k="Ayuntamiento" v={muns.find(m => m.id === form.municipality_id)?.name ?? "—"} />
            <Row k="Email de acceso" v={withAccess ? form.email : "— sin acceso —"} />
            <Row k="Rol" v={withAccess ? form.role : "—"} />
            <Row k="Estado inicial" v={withAccess ? form.access_status : "Sin acceso"} />
            <Row k="Forzar cambio contraseña" v={withAccess && form.must_change_password ? "Sí" : "No"} />
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4 mr-1" /> Atrás</Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setWithAccess(false); submit(); }} disabled={busy || !withAccess}>Guardar sin acceso</Button>
              <Button onClick={submit} disabled={busy}>{busy ? "Creando…" : "Crear empleado y acceso"}</Button>
            </div>
          </div>
        </Card>
      )}
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
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between px-3 py-2"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}
