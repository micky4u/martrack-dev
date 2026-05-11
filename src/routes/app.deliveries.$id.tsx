import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth-context";
import { ArrowLeft, PenLine, X, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { logAudit, logChange } from "@/lib/audit";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/app/deliveries/$id")({
  head: () => ({ meta: [{ title: "Entrega · MarTrack PMV" }] }),
  component: DeliveryDetail,
});

function DeliveryDetail() {
  const { id } = Route.useParams();
  const { role, user } = useAuth();
  const [d, setD] = useState<any>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [signature, setSignature] = useState<any>(null);
  const [notes, setNotes] = useState<string>("");
  const [cancelReason, setCancelReason] = useState<string>("");

  const load = async () => {
    const { data: dd } = await supabase.from("vehicle_deliveries")
      .select("*, vehicles(*, municipalities(name))").eq("id", id).single();
    setD(dd);
    setNotes(dd?.notes ?? "");
    if (dd?.vehicle_id) {
      const { data: ev } = await supabase.from("vehicle_evidence").select("*").eq("vehicle_id", dd.vehicle_id).eq("active", true);
      setEvidence(ev ?? []);
    }
    const { data: sig } = await supabase.from("delivery_signatures").select("*").eq("delivery_id", id).maybeSingle();
    setSignature(sig);
    // Two-step (no FK between user_roles and profiles -> embed returns nothing)
    const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "supervisor");
    const ids = (roleRows ?? []).map((r: any) => r.user_id);
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles")
        .select("id,email,full_name,active,position,municipality_id,municipalities(name)")
        .in("id", ids).eq("active", true).order("full_name");
      setSupervisors((profs ?? []).map((p: any) => ({ user_id: p.id, profiles: p })));
    } else {
      setSupervisors([]);
    }
  };
  useEffect(() => { load(); }, [id]);

  if (!d) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  const canManage = role === "root" || role === "coordinador";
  const isRoot = role === "root";
  const isSupervisor = user?.id === d.supervisor_id;
  const closed = d.status === "firmado" || d.status === "cerrado";
  const cancelled = d.status === "cancelado";
  const evCount = evidence.length;

  const updateStatus = async (status: string, extra: any = {}, action?: string) => {
    const before = { status: d.status };
    const { error } = await supabase.from("vehicle_deliveries").update({ status, ...extra }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logChange({
      entity_type: "delivery", entity_id: id,
      action: action ?? "entrega_estado_cambiado",
      before, after: { status },
      fields: ["status"],
    });
    toast.success("Estado actualizado");
    load();
  };

  const assignSupervisor = async (supervisorId: string) => {
    const before = { supervisor_id: d.supervisor_id };
    await supabase.from("vehicle_deliveries").update({
      supervisor_id: supervisorId,
      status: d.status === "evidencias_pendientes" || d.status === "borrador" ? "pendiente_firma" : d.status,
    }).eq("id", id);
    await logChange({
      entity_type: "delivery", entity_id: id, action: "supervisor_reasignado",
      before, after: { supervisor_id: supervisorId }, fields: ["supervisor_id"],
    });
    toast.success("Supervisor asignado");
    load();
  };

  const saveNotes = async () => {
    const before = { notes: d.notes };
    await supabase.from("vehicle_deliveries").update({ notes }).eq("id", id);
    await logChange({
      entity_type: "delivery", entity_id: id, action: "entrega_actualizada",
      before, after: { notes }, fields: ["notes"],
    });
    toast.success("Observaciones guardadas");
    load();
  };

  const cancel = async () => {
    if (!cancelReason.trim()) { toast.error("Indica el motivo"); return; }
    await supabase.from("vehicle_deliveries").update({
      status: "cancelado", cancel_reason: cancelReason,
    }).eq("id", id);
    await logAudit({
      entity_type: "delivery", entity_id: id, action: "entrega_cancelada",
      description: `Cancelada. Motivo: ${cancelReason}`,
    });
    toast.success("Entrega cancelada");
    setCancelReason("");
    load();
  };

  const reopen = async () => {
    await supabase.from("vehicle_deliveries").update({
      status: "evidencias_pendientes", closed_at: null,
    }).eq("id", id);
    await logAudit({
      entity_type: "delivery", entity_id: id, action: "entrega_reabierta",
      description: `Entrega reabierta por root desde estado ${d.status}`,
    });
    toast.success("Entrega reabierta");
    load();
  };

  return (
    <div className="space-y-5">
      <Link to="/app/deliveries" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3 mr-1" /> Volver a entregas
      </Link>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Entrega {d.id.slice(0, 8)}</h1>
            <StatusBadge status={d.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            <Link to="/app/vehicles/$id" params={{ id: d.vehicle_id }} className="hover:underline">
              {d.vehicles?.plate} · {d.vehicles?.brand} {d.vehicles?.model}
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          {isSupervisor && d.status === "pendiente_firma" && (
            <Button asChild><Link to="/app/deliveries/$id/sign" params={{ id }}><PenLine className="h-4 w-4 mr-1" />Firmar entrega</Link></Button>
          )}
          {isRoot && (closed || cancelled) && (
            <Button variant="outline" onClick={reopen}><RotateCcw className="h-4 w-4 mr-1" />Reabrir</Button>
          )}
          {canManage && !closed && !cancelled && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline"><X className="h-4 w-4 mr-1" />Cancelar entrega</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar entrega</AlertDialogTitle>
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
            <h2 className="text-sm font-semibold mb-3">Flujo de entrega</h2>
            <ol className="space-y-2 text-sm">
              <Step done label="Entrega creada" />
              <Step done={evCount > 0} label={`Evidencias adjuntas (${evCount})`} />
              <Step done={!!d.supervisor_id} label="Supervisor asignado" />
              <Step done={!!signature} label="Firma del supervisor" />
              <Step done={d.status === "cerrado"} label="Entrega cerrada" />
            </ol>
          </div>

          {canManage && !closed && !cancelled && (
            <div className="border-t border-border pt-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs">Asignar / cambiar supervisor</label>
                <Select value={d.supervisor_id ?? ""} onValueChange={assignSupervisor} disabled={evCount === 0}>
                  <SelectTrigger><SelectValue placeholder={evCount === 0 ? "Adjunta evidencias antes" : "Selecciona supervisor"} /></SelectTrigger>
                  <SelectContent>
                    {supervisors.map((s: any) => (
                      <SelectItem key={s.user_id} value={s.user_id}>{s.profiles.full_name || s.profiles.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {d.status === "firmado" && (
                <Button variant="outline" onClick={() => updateStatus("cerrado", { closed_at: new Date().toISOString() })}>Cerrar entrega</Button>
              )}
            </div>
          )}

          {(canManage || isSupervisor) && (
            <div className="border-t border-border pt-4 space-y-2">
              <label className="text-xs">Observaciones</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas internas de esta entrega…" disabled={closed && !isRoot} />
              {(notes !== (d.notes ?? "")) && (
                <div className="flex justify-end">
                  <Button size="sm" onClick={saveNotes}><Save className="h-3 w-3 mr-1" />Guardar observaciones</Button>
                </div>
              )}
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
            <Row l="Supervisor" v={d.supervisor_id ? supervisors.find((s: any) => s.user_id === d.supervisor_id)?.profiles?.email : "—"} />
            <Row l="Firmada" v={d.signed_at ? new Date(d.signed_at).toLocaleString() : "—"} />
            <Row l="Cerrada" v={d.closed_at ? new Date(d.closed_at).toLocaleString() : "—"} />
          </dl>
          {signature && (
            <div className="mt-4 border-t border-border pt-3">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Firma</div>
              <img src={supabase.storage.from("signatures").getPublicUrl(signature.storage_path).data.publicUrl}
                alt="firma" className="border border-border rounded bg-white" />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-4 w-4 rounded-full border ${done ? "bg-success border-success" : "bg-background border-border"}`} />
      <span className={done ? "" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}
function Row({ l, v }: { l: string; v: any }) {
  return <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{l}</dt><dd className="text-right">{v ?? "—"}</dd></div>;
}
