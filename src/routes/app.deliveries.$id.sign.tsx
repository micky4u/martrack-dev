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
  "Declaro haber revisado el vehículo asignado, el personal/equipo a mi cargo y las evidencias adjuntas. Acepto la asignación operativa del recurso en el estado registrado. Desde esta firma, la asignación queda Dada por Asignada y bloqueada para modificaciones no autorizadas.";

export const Route = createFileRoute("/app/deliveries/$id/sign")({
  head: () => ({ meta: [{ title: "Firma móvil · MarTrack PMV" }] }),
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
  const [assignedEmployee, setAssignedEmployee] = useState<any>(null);

  const initCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = c.getBoundingClientRect();
    c.width = Math.floor(rect.width * ratio);
    c.height = Math.floor(220 * ratio);
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, 220);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.25;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("vehicle_deliveries")
        .select("*, vehicles(plate,brand,model,mileage)")
        .eq("id", id)
        .single();
      setD(data);
      if (data?.assigned_employee_id) {
        const { data: emp } = await supabase.from("profiles").select("id,email,full_name,position").eq("id", data.assigned_employee_id).maybeSingle();
        setAssignedEmployee(emp);
      }
    })();
    requestAnimationFrame(initCanvas);
    window.addEventListener("resize", initCanvas);
    return () => window.removeEventListener("resize", initCanvas);
  }, [id]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawing(true);
    setHasInk(true);
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = () => setDrawing(false);

  const clear = () => {
    initCanvas();
    setHasInk(false);
  };

  const submit = async () => {
    if (!user || !d) return;
    if (d.supervisor_id !== user.id) {
      toast.error("Solo el supervisor asignado puede firmar esta asignación.");
      return;
    }
    if (!["pendiente_firma", "firmado"].includes(d.status)) {
      toast.error("Esta asignación no está pendiente de firma o ya fue bloqueada.");
      return;
    }
    if (!hasInk || !accepted) {
      toast.error("Acepta el texto y firma en pantalla.");
      return;
    }

    setBusy(true);
    const blob: Blob = await new Promise((resolve, reject) => {
      canvasRef.current!.toBlob((b) => b ? resolve(b) : reject(new Error("No se pudo generar la firma")), "image/png");
    });

    const path = `${id}/${user.id}-${Date.now()}.png`;
    const { error: upErr } = await supabase.storage.from("signatures").upload(path, blob, { contentType: "image/png", upsert: false });
    if (upErr) {
      toast.error(upErr.message);
      setBusy(false);
      return;
    }

    const { error: insErr } = await supabase.from("delivery_signatures").insert({
      delivery_id: id,
      signed_by: user.id,
      signer_name: user.email,
      storage_path: path,
      acceptance_text: ACCEPT_TEXT,
    });
    if (insErr) {
      toast.error(insErr.message);
      setBusy(false);
      return;
    }

    const signedAt = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("vehicle_deliveries")
      .update({ status: "dado_por_asignado", signed_at: signedAt, assignment_locked: true })
      .eq("id", id)
      .eq("supervisor_id", user.id)
      .in("status", ["pendiente_firma", "firmado"]);
    if (updErr) {
      toast.error(updErr.message);
      setBusy(false);
      return;
    }

    await logAudit({ entity_type: "delivery", entity_id: id, action: "asignacion_firmada", description: "Asignación dada por asignada por supervisor" });
    setBusy(false);
    toast.success("Asignación firmada y bloqueada");
    navigate({ to: "/app/deliveries/$id", params: { id } });
  };

  if (!d) return <div className="text-sm text-muted-foreground">Cargando…</div>;

  const isOwner = user?.id === d.supervisor_id;
  const locked = d.assignment_locked || d.status === "dado_por_asignado" || d.status === "cerrado";

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-8">
      <Link to="/app/deliveries/$id" params={{ id }} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3 mr-1" /> Volver a la asignación
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Firma móvil de asignación</h1>
        <p className="text-sm text-muted-foreground mt-1">{d.vehicles?.plate} · {d.vehicles?.brand} {d.vehicles?.model}</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <Row l="Vehículo" v={`${d.vehicles?.plate ?? "—"} · ${d.vehicles?.brand ?? ""} ${d.vehicles?.model ?? ""}`} />
          <Row l="Kilometraje" v={d.vehicles?.mileage != null ? `${d.vehicles.mileage} km` : "—"} />
          <Row l="Empleado/equipo" v={assignedEmployee ? `${assignedEmployee.full_name || assignedEmployee.email}${assignedEmployee.position ? ` · ${assignedEmployee.position}` : ""}` : "—"} />
          <Row l="Estado" v={d.status} />
        </div>

        {!isOwner && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">Esta firma solo corresponde al supervisor asignado.</div>}
        {locked && <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">Esta asignación ya está confirmada y bloqueada.</div>}

        <p className="text-sm leading-relaxed">{ACCEPT_TEXT}</p>
        <div className="flex items-start gap-2">
          <Checkbox id="acc" checked={accepted} onCheckedChange={(v) => setAccepted(!!v)} disabled={!isOwner || locked} />
          <label htmlFor="acc" className="text-sm">Acepto la asignación del vehículo y la responsabilidad operativa registrada.</label>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Firma aquí</div>
          <div className="border border-border rounded bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full h-[220px] touch-none cursor-crosshair block"
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onPointerLeave={end}
            />
          </div>
          <div className="flex justify-between items-center gap-2">
            <Button variant="outline" size="sm" onClick={clear} type="button" disabled={!isOwner || locked}>Borrar</Button>
            <span className="text-xs text-muted-foreground text-right">{user?.email} · {new Date().toLocaleString()}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button onClick={submit} disabled={!isOwner || locked || !hasInk || !accepted || busy}>
            {busy ? "Registrando…" : "Firmar y dar por asignado"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Row({ l, v }: { l: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{l}</span><span className="font-medium text-right">{v}</span></div>;
}
