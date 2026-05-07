import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth-context";
import { Upload, Plus, ArrowLeft, Pencil, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/app/vehicles/$id")({
  head: () => ({ meta: [{ title: "Vehículo · MarTrack PMV" }] }),
  component: VehicleDetail,
});

function VehicleDetail() {
  const { id } = Route.useParams();
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [v, setV] = useState<any>(null);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [desc, setDesc] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [{ data: vd }, { data: ed }, { data: hd }, { data: dd }] = await Promise.all([
      supabase.from("vehicles").select("*, municipalities(name)").eq("id", id).single(),
      supabase.from("vehicle_evidence").select("*").eq("vehicle_id", id).order("created_at",{ascending:false}),
      supabase.from("audit_log").select("*").eq("entity_type","vehicle").eq("entity_id",id).order("created_at",{ascending:false}).limit(20),
      supabase.from("vehicle_deliveries").select("id,status,created_at").eq("vehicle_id",id).order("created_at",{ascending:false}),
    ]);
    setV(vd); setEvidence(ed ?? []); setHistory(hd ?? []); setDeliveries(dd ?? []);
  };

  useEffect(() => { load(); }, [id]);

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const isImg = file.type.startsWith("image/");
      const bucket = isImg ? "vehicle-photos" : "vehicle-documents";
      const path = `${id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, file);
      if (upErr) { toast.error(upErr.message); continue; }
      await supabase.from("vehicle_evidence").insert({
        vehicle_id: id, uploaded_by: user.id, bucket, storage_path: path,
        file_name: file.name, mime_type: file.type, description: desc || null,
        kind: isImg ? "photo" : "document",
      });
      await logAudit({ entity_type: "vehicle", entity_id: id, action: "evidence_upload", description: `Evidencia subida: ${file.name}` });
    }
    setUploading(false); setDesc(""); if (fileRef.current) fileRef.current.value = "";
    toast.success("Evidencias subidas");
    load();
  };

  const startDelivery = async () => {
    if (!user) return;
    const { data, error } = await supabase.from("vehicle_deliveries").insert({
      vehicle_id: id, created_by: user.id, status: "evidencias_pendientes",
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    await logAudit({ entity_type: "delivery", entity_id: data.id, action: "create", description: `Entrega iniciada para vehículo ${v?.plate}` });
    navigate({ to: "/app/deliveries/$id", params: { id: data.id } });
  };

  if (!v) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  const canEdit = role === "root" || role === "coordinador";
  const publicUrl = (b: string, p: string) => supabase.storage.from(b).getPublicUrl(p).data.publicUrl;

  return (
    <div className="space-y-5">
      <Link to="/app/vehicles" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3 mr-1" /> Volver a vehículos
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight font-mono">{v.plate}</h1>
            <StatusBadge status={v.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">{v.brand} {v.model} · {v.year} · {v.municipalities?.name ?? "Sin ayuntamiento"}</p>
        </div>
        {canEdit && (
          <Button onClick={startDelivery}><Plus className="h-4 w-4 mr-1" /> Iniciar entrega</Button>
        )}
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="evidence">Evidencias ({evidence.length})</TabsTrigger>
          <TabsTrigger value="deliveries">Entregas ({deliveries.length})</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <Card className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <Info l="Matrícula" v={v.plate} />
            <Info l="Marca / Modelo" v={`${v.brand} ${v.model}`} />
            <Info l="Año" v={v.year} />
            <Info l="Fecha matriculación" v={v.registration_date} />
            <Info l="Color" v={v.color} />
            <Info l="Tipo motor" v={v.engine_type} />
            <Info l="Combustible" v={v.fuel} />
            <Info l="Kilometraje" v={v.mileage?.toLocaleString()} />
            <Info l="Ayuntamiento" v={v.municipalities?.name} />
            <Info l="Alta" v={new Date(v.created_at).toLocaleDateString()} />
            <Info l="Última actualización" v={new Date(v.updated_at).toLocaleDateString()} />
            <div className="col-span-full">
              <Info l="Observaciones" v={v.observations || "—"} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="evidence" className="mt-4 space-y-4">
          {canEdit && (
            <Card className="p-4">
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs">Descripción (opcional)</label>
                  <input className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm" value={desc} onChange={(e)=>setDesc(e.target.value)} />
                </div>
                <input ref={fileRef} type="file" multiple onChange={(e) => onUpload(e.target.files)} className="hidden" id="upload" />
                <Button asChild disabled={uploading}>
                  <label htmlFor="upload" className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-1" /> {uploading ? "Subiendo…" : "Subir archivos"}
                  </label>
                </Button>
              </div>
            </Card>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {evidence.filter(e=>e.kind==="photo").map(ev => (
              <a key={ev.id} href={publicUrl(ev.bucket, ev.storage_path)} target="_blank" rel="noreferrer" className="block group">
                <div className="aspect-square bg-muted rounded overflow-hidden border border-border">
                  <img src={publicUrl(ev.bucket, ev.storage_path)} alt={ev.file_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 truncate">{ev.description || ev.file_name}</div>
              </a>
            ))}
          </div>
          {evidence.filter(e=>e.kind==="document").length > 0 && (
            <Card className="p-4">
              <div className="text-xs font-semibold mb-2 uppercase tracking-wider text-muted-foreground">Documentos</div>
              <ul className="space-y-1 text-sm">
                {evidence.filter(e=>e.kind==="document").map(ev => (
                  <li key={ev.id}><a href={publicUrl(ev.bucket, ev.storage_path)} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{ev.file_name}</a></li>
                ))}
              </ul>
            </Card>
          )}
          {evidence.length === 0 && <p className="text-sm text-muted-foreground">Sin evidencias todavía</p>}
        </TabsContent>

        <TabsContent value="deliveries" className="mt-4">
          <Card className="divide-y divide-border">
            {deliveries.length === 0 && <div className="p-4 text-sm text-muted-foreground">Sin entregas</div>}
            {deliveries.map(d => (
              <Link key={d.id} to="/app/deliveries/$id" params={{id:d.id}} className="flex items-center justify-between p-4 text-sm hover:bg-accent">
                <div>
                  <div className="font-medium">Entrega {d.id.slice(0,8)}</div>
                  <div className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</div>
                </div>
                <StatusBadge status={d.status} />
              </Link>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="divide-y divide-border">
            {history.length === 0 && <div className="p-4 text-sm text-muted-foreground">Sin eventos</div>}
            {history.map(h => (
              <div key={h.id} className="p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{h.action}</span>
                  <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</span>
                </div>
                {h.description && <div className="text-xs text-muted-foreground mt-0.5">{h.description}</div>}
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ l, v }: { l: string; v: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{l}</div>
      <div className="mt-0.5">{v ?? "—"}</div>
    </div>
  );
}
