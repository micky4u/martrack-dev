import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth-context";
import { ArrowLeft, PenLine } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

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

  const load = async () => {
    const { data: dd } = await supabase.from("vehicle_deliveries")
      .select("*, vehicles(*, municipalities(name))").eq("id", id).single();
    setD(dd);
    if (dd?.vehicle_id) {
      const { data: ev } = await supabase.from("vehicle_evidence").select("*").eq("vehicle_id", dd.vehicle_id);
      setEvidence(ev ?? []);
    }
    const { data: sig } = await supabase.from("delivery_signatures").select("*").eq("delivery_id", id).maybeSingle();
    setSignature(sig);
    // load supervisors
    const { data: roleRows } = await supabase.from("user_roles").select("user_id, profiles!inner(id,email,full_name)").eq("role","supervisor");
    setSupervisors(roleRows ?? []);
  };
  useEffect(() => { load(); }, [id]);

  if (!d) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  const canManage = role === "root" || role === "coordinador";
  const isSupervisor = user?.id === d.supervisor_id;
  const closed = d.status === "firmado" || d.status === "cerrado";
  const evCount = evidence.length;

  const updateStatus = async (status: string, extra: any = {}) => {
    const { error } = await supabase.from("vehicle_deliveries").update({ status, ...extra }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ entity_type: "delivery", entity_id: id, action: `status:${status}` });
    load();
  };

  const assignSupervisor = async (supervisorId: string) => {
    await supabase.from("vehicle_deliveries").update({ supervisor_id: supervisorId, status: "pendiente_firma" }).eq("id", id);
    await logAudit({ entity_type: "delivery", entity_id: id, action: "assign_supervisor", description: `Supervisor asignado: ${supervisorId}` });
    toast.success("Supervisor asignado");
    load();
  };

  return (
    <div className="space-y-5">
      <Link to="/app/deliveries" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3 mr-1" /> Volver a entregas
      </Link>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Entrega {d.id.slice(0,8)}</h1>
            <StatusBadge status={d.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            <Link to="/app/vehicles/$id" params={{id:d.vehicle_id}} className="hover:underline">
              {d.vehicles?.plate} · {d.vehicles?.brand} {d.vehicles?.model}
            </Link>
          </p>
        </div>
        {isSupervisor && d.status === "pendiente_firma" && (
          <Button asChild><Link to="/app/deliveries/$id/sign" params={{id}}><PenLine className="h-4 w-4 mr-1"/>Firmar entrega</Link></Button>
        )}
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
              <Step done={d.status==="cerrado"} label="Entrega cerrada" />
            </ol>
          </div>

          {canManage && !closed && (
            <div className="border-t border-border pt-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs">Asignar supervisor</label>
                <Select value={d.supervisor_id ?? ""} onValueChange={assignSupervisor} disabled={evCount===0}>
                  <SelectTrigger><SelectValue placeholder={evCount===0?"Adjunta evidencias antes":"Selecciona supervisor"}/></SelectTrigger>
                  <SelectContent>
                    {supervisors.map((s:any) => (
                      <SelectItem key={s.user_id} value={s.user_id}>{s.profiles.full_name || s.profiles.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {d.status === "firmado" && (
                <Button variant="outline" onClick={()=>updateStatus("cerrado",{closed_at:new Date().toISOString()})}>Cerrar entrega</Button>
              )}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3">Detalles</h2>
          <dl className="text-sm space-y-2">
            <Row l="Ayuntamiento" v={d.vehicles?.municipalities?.name} />
            <Row l="Creada" v={new Date(d.created_at).toLocaleString()} />
            <Row l="Supervisor" v={d.supervisor_id ? supervisors.find((s:any)=>s.user_id===d.supervisor_id)?.profiles?.email : "—"} />
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

function Step({done,label}:{done:boolean;label:string}) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-4 w-4 rounded-full border ${done?"bg-success border-success":"bg-background border-border"}`}/>
      <span className={done?"":"text-muted-foreground"}>{label}</span>
    </li>
  );
}
function Row({l,v}:{l:string;v:any}) {
  return <div className="flex justify-between gap-2"><dt className="text-muted-foreground">{l}</dt><dd className="text-right">{v ?? "—"}</dd></div>;
}
