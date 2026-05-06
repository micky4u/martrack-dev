import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth-context";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

const ACCEPT_TEXT =
  "Declaro haber revisado el vehículo asignado, junto con las evidencias adjuntas, y acepto la entrega en el estado registrado. A partir de esta entrega, quedo identificado como responsable operativo del recurso según las condiciones internas establecidas.";

export const Route = createFileRoute("/app/deliveries/$id/sign")({
  head: () => ({ meta: [{ title: "Firma · MarTrack PMV" }] }),
  component: SignPage,
});

function SignPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    supabase.from("vehicle_deliveries").select("*, vehicles(plate,brand,model)").eq("id",id).single()
      .then(({data}) => setD(data));
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.lineCap = "round";
  }, [id]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const start = (e: React.PointerEvent) => {
    setDrawing(true); setHasInk(true);
    const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing) return;
    const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const end = () => setDrawing(false);
  const clear = () => {
    const c = canvasRef.current!; const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,c.width,c.height); setHasInk(false);
  };

  const submit = async () => {
    if (!user || !hasInk || !accepted) return;
    setBusy(true);
    const blob: Blob = await new Promise((res) => canvasRef.current!.toBlob((b) => res(b!), "image/png")!);
    const path = `${id}/${Date.now()}.png`;
    const { error: upErr } = await supabase.storage.from("signatures").upload(path, blob, { contentType: "image/png" });
    if (upErr) { toast.error(upErr.message); setBusy(false); return; }
    const { error: insErr } = await supabase.from("delivery_signatures").insert({
      delivery_id: id, signed_by: user.id, signer_name: user.email,
      storage_path: path, acceptance_text: ACCEPT_TEXT,
    });
    if (insErr) { toast.error(insErr.message); setBusy(false); return; }
    await supabase.from("vehicle_deliveries").update({ status: "firmado", signed_at: new Date().toISOString() }).eq("id", id);
    await logAudit({ entity_type: "delivery", entity_id: id, action: "sign", description: "Entrega firmada por supervisor" });
    setBusy(false);
    toast.success("Entrega firmada correctamente");
    navigate({ to: "/app/deliveries/$id", params: { id } });
  };

  return (
    <div className="max-w-2xl space-y-5">
      <Link to="/app/deliveries/$id" params={{id}} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3 mr-1" /> Volver a la entrega
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Firma de aceptación</h1>
        {d && <p className="text-sm text-muted-foreground mt-1">{d.vehicles?.plate} · {d.vehicles?.brand} {d.vehicles?.model}</p>}
      </div>

      <Card className="p-5 space-y-4">
        <p className="text-sm leading-relaxed">{ACCEPT_TEXT}</p>
        <div className="flex items-start gap-2">
          <Checkbox id="acc" checked={accepted} onCheckedChange={(v)=>setAccepted(!!v)} />
          <label htmlFor="acc" className="text-sm">Acepto la entrega del vehículo en el estado registrado.</label>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Firma aquí</div>
          <div className="border border-border rounded bg-white">
            <canvas ref={canvasRef} width={700} height={220}
              className="w-full touch-none cursor-crosshair"
              onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
          </div>
          <div className="flex justify-between items-center">
            <Button variant="outline" size="sm" onClick={clear} type="button">Borrar</Button>
            <span className="text-xs text-muted-foreground">{user?.email} · {new Date().toLocaleString()}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button onClick={submit} disabled={!hasInk || !accepted || busy}>
            {busy ? "Registrando…" : "Confirmar firma"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
