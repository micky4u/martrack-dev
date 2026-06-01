import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth-context";
import { canManageAssignments, isAssignmentLocked } from "@/lib/rbac";
import { ArrowLeft, PenLine, X, RotateCcw, Save, Upload, Lock } from "lucide-react";
import { toast } from "sonner";
import { logAudit, logChange } from "@/lib/audit";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/app/deliveries/$id")({
  head: () => ({ meta: [{ title: "Asignación · MarTrack PMV" }] }),
  component: DeliveryDetail,
});

type Person = { id: string; email: string | null; full_name: string | null; position: string | null; role: string };

function personLabel(p?: Person | null) {
  if (!p) return "—";
  return [p.full_name || p.email, p.position].filter(Boolean).join(" · ");
}

function DeliveryDetail() {
  const { id } = Route.useParams();
  const { role, user } = useAuth();
  const [d, setD] = useState<any>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [signature, setSignature] = useState<any>(null);
  const [notes, setNotes] = useState<string>("");
  const [cancelReason, setCancelReason] = useState<string>("");

  const canManage = canManageAssignments(role);
  const isRoot = role === "root";

  const loadPeople = async () => {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,email,full_name,active,position")
      .eq("active", true)
      .order("full_name");
    const base = profs ?? [];
    if (!base.length) {
      setPeople([]);
      return;
    }
    const { data: ov } = await supabase.functions.invoke("manage-user-access", {
      body: { action: "list_access_overview", ids: base.map((p: any) => p.id) },
    });
    const roleMap = new Map<string, string>(((ov as any)?.users ?? []).map((u: any) => [u.id, u.role ?? "empleado"]));
    setPeople(base.map((p: any) => ({ id: p.id, email: p.email, full_name: p.full_name, position: p.position, role: roleMap.get(p.id) ?? "empleado" })));
  };

  const load = async () => {
    const { data: dd } = await supabase
      .from("vehicle_deliveries")
      .select("*, vehicles(*, municipalities(name))")
      .eq("id", id)
      .single();
    setD(dd);
    setNotes(dd?.notes ?? "");

    if (dd?.vehicle_id) {
      const { data: ev } = await supabase.from("vehicle_evidence").select("*").eq("vehicle_id", dd.vehicle_id).eq("active", true);
      setEvidence(ev ?? []);
    }

    const { data: sig } = await supabase.from("delivery_signatures").select("*").eq("delivery_id", id).maybeSingle();
    if (sig) {
      const { data: signed } = await supabase.storage.from("signatures").createSignedUrl(sig.storage_path, 600);
      setSignature({ ...sig, signedUrl: signed?.signedUrl ?? null });
    } else {
      setSignature(null);
    }

    if (canManage || dd?.supervisor_id === user?.id) await loadPeople();
  };

  useEffect(() => { load(); }, [id, canManage, user?.id]);

  if (!d) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  const isSupervisor = user?.id === d.supervisor_id;
  const locked = isAssignmentLocked(d.status, d.assignment_locked);
  const cancelled = d.status === "cancelado";
  const evCount = evidence.length;
  const supervisors = people.filter((p) => p.role === "supervisor" || p.role === "coordinador");
  const employees = people.filter((p) => p.role === "empleado" || p.role === "supervisor");
  const peopleById = new Map(people.map((p) => [p.id, p]));

  const updateStatus = async (status: string, extra: any = {}, action?: string) => {
    const before = { status: d.status };
    const { error } = await supabase.from("vehicle_deliveries").update({ status, ...extra }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logChange({ entity_type: "delivery", entity_id: id, action: action ?? "asignacion_estado_cambiado", before, after: { status }, fields: ["status"] });
    toast.success("Estado actualizado");
    load();
  };

  const assignSupervisor = async (supervisorId: string) => {
    if (locked) { toast.error("La asignación está bloqueada. Solo root puede reabrirla."); return; }
    const before = { supervisor_id: d.supervisor_id, status: d.status };
    const { error } = await supabase.from("vehicle_deliveries").update({ supervisor_id: supervisorId, status: "pendiente_firma" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logChange({ entity_type: "delivery", entity_id: id, action: "supervisor_asignado", before, after: { supervisor_id: supervisorId, status: "pendiente_firma" }, fields: ["supervisor_id", "status"] });
    toast.success("Supervisor asignado");
    load();
  };

  const assignEmployee = async (employeeId: string) => {
    if (locked) { toast.error("La asignación está bloqueada. Solo root puede reabrirla."); return; }
    const value = employeeId === "none" ? null : employeeId;
    const before = { assigned_employee_id: d.assigned_employee_id };
    const { error } = await supabase.from("vehicle_deliveries").update({ assigned_employee_id: value } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logChange({ entity_type: "delivery", entity_id: id, action: "empleado_asignado", before, after: { assigned_employee_id: value }, fields: ["assigned_employee_id"] });
    toast.success("Empleado/equipo actualizado");
    load();
  };

  const saveNotes = async () => {
    if (locked && !isRoot) { toast.error("La asignación está bloqueada."); return; }
    const before = { notes: d.notes };
    const { error } = await supabase.from("vehicle_deliveries").update({ notes }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logChange({ entity_type: "delivery", entity_id: id, action: "asignacion_actualizada", before, after: { notes }, fields: ["notes"] });
    toast.success("Observaciones guardadas");
    load();
  };

  const cancel = async () => {
    if (!cancelReason.trim()) { toast.error("Indica el motivo"); return; }
    const { error } = await supabase.from("vehicle_deliveries").update({ status: "cancelado", cancel_reason: cancelReason }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ entity_type: "delivery", entity_id: id, action: "asignacion_cancelada", description: `Cancelada. Motivo: ${cancelReason}` });
    toast.success("Asignación cancelada");
    setCancelReason("");
    load();
  };

  const reopen = async () => {
    const { error } = await supabase.from("vehicle_deliveries").update({ status: "pendiente_firma", closed_at: null, assignment_locked: false } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ entity_type: "delivery", entity_id: id, action: "asignacion_reabierta", description: `Asignación reabierta por root desde estado ${d.status}` });
    toast.success("Asignación reabierta");
    load();
  };

  return (
    <div className="space-y-5">
      <Link to="/app/deliveries" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3 mr-1" /> Volver a asignaciones
      </Link>

      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">Asignación {d.id.slice(0, 8)}</h1>
            <StatusBadge status={d.status} />
            {locked && <span className="inline-flex items-center text-xs text-muted-foreground"><Lock className="h-3 w-3 mr-1" /> Bloqueada</span>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            <Link to="/app/vehicles/$id" params={{ id: d.vehicle_id }} className="hover:underline">
              {d.vehicles?.plate} · {d.vehicles?.brand} {d.vehicles?.model}
            </Link>
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {isSupervisor && !locked && !cancelled && (
            <Button asChild variant="outline"><Link to="/app/vehicles/$id" params={{ id: d.vehicle_id }}><Upload className="h-4 w-4 mr-1" />Subir evidencias</Link></Button>
          )}
          {isSupervisor && !locked && !cancelled && d.status === "pendiente_firma" && (
            <Button asChild><Link to="/app/deliveries/$id/sign" params={{ id }}><PenLine className="h-4 w-4 mr-1" />Firmar aceptación</Link></Button>
          )}
          {isRoot && (locked || cancelled) && <Button variant="outline" onClick={reopen}><RotateCcw className="h-4 w-4 mr-1" />Reabrir</Button>}
          {canManage && !locked && !cancelled && (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline"><X className="h-4 w-4 mr-1" />Cancelar</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar asignación</AlertDialogTitle>
                  <AlertDialogDescription>Indica el motivo. Quedará registrado en auditoría.</AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Motivo de la cancelación…" />
                <AlertDialogFooter>
                  <AlertDialogCancel>Volver</AlertDialogCancel>
                  <AlertDialogAction onClick={cancel}>Confirmar cancelación</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2 space-y-4">
          <div>
            <h2 className="text-sm font-semibold mb-3">Flujo operativo</h2>
            <ol className="space-y-2 text-sm">
              <Step done label="Asignación creada" />
              <Step done={!!d.vehicle_id} label="Vehículo asignado" />
              <Step done={!!d.supervisor_id} label="Supervisor asignado" />
              <Step done={evCount > 0} label={`Evidencias adjuntas (${evCount})`} />
              <Step done={!!signature || d.status === "dado_por_asignado"} label="Firma móvil del supervisor" />
              <Step done={d.status === "dado_por_asignado" || d.status === "cerrado"} label="Dado por Asignado / Activo" />
            </ol>
          </div>

          {canManage && !locked && !cancelled && (
            <div className="border-t border-border pt-4 grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs">Supervisor responsable</label>
                <Select value={d.supervisor_id ?? ""} onValueChange={assignSupervisor}>
                  <SelectTrigger><SelectValue placeholder="Selecciona supervisor" /></SelectTrigger>
                  <SelectContent>{supervisors.map((s) => <SelectItem key={s.id} value={s.id}>{personLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs">Empleado / equipo a cargo</label>
                <Select value={d.assigned_employee_id ?? "none"} onValueChange={assignEmployee}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sin empleado concreto —</SelectItem>
                    {employees.map((e) => <SelectItem key={e.id} value={e.id}>{personLabel(e)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {(canManage || isSupervisor) && (
            <div className="border-t border-border pt-4 space-y-2">
              <label className="text-xs">Observaciones</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas internas de esta asignación…" disabled={locked && !isRoot} />
              {notes !== (d.notes ?? "") && <div className="flex justify-end"><Button size="sm" onClick={saveNotes}><Save className="h-3 w-3 mr-1" />Guardar</Button></div>}
            </div>
          )}

          {cancelled && d.cancel_reason && (
            <div className="border-t border-border pt-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Motivo de cancelación</div>
              <div className="text-sm">{d.cancel_reason}</div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3">Detalles</h2>
          <dl className="text-sm space-y-2">
            <Row l="Ayuntamiento" v={d.vehicles?.municipalities?.name} />
            <Row l="Creada" v={new Date(d.created_at).toLocaleString()} />
            <Row l="Supervisor" v={personLabel(peopleById.get(d.supervisor_id))} />
            <Row l="Empleado/equipo" v={personLabel(peopleById.get(d.assigned_employee_id))} />
            <Row l="Firmada" v={d.signed_at ? new Date(d.signed_at).toLocaleString() : "—"} />
            <Row l="Cerrada" v={d.closed_at ? new Date(d.closed_at).toLocaleString() : "—"} />
          </dl>
          {signature && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Firma</div>
              {signature.signedUrl ? <img src={signature.signedUrl} alt="firma" className="border border-border rounded bg-white" /> : <div className="text-xs text-muted-foreground">No tienes permiso para visualizar esta firma.</div>}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return <li className="flex items-center gap-2"><span className={`h-4 w-4 rounded-full border ${done ? "bg-success border-success" : "bg-background border-border"}`} /><span className={done ? "" : "text-muted-foreground"}>{label}</span></li>;
}

function Row({ l, v }: { l: string; v: any }) {
  return <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{l}</dt><dd className="text-right">{v ?? "—"}</dd></div>;
}
