import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/app/evidence/")({
  head: () => ({ meta: [{ title: "Evidencias · MarTrack PMV" }] }),
  component: EvidencePage,
});

function EvidencePage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("vehicle_evidence")
      .select("*, vehicles(plate)")
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => setRows(data ?? []));
  }, []);
  const url = (b: string, p: string) => supabase.storage.from(b).getPublicUrl(p).data.publicUrl;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Evidencias</h1>
        <p className="text-sm text-muted-foreground mt-1">Galería global de la flota</p>
      </div>
      {rows.length === 0 && (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          Aún no hay evidencias. Sube fotos desde el detalle de un vehículo.
        </Card>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {rows.filter(r=>r.kind==="photo").map(r => (
          <a key={r.id} href={url(r.bucket,r.storage_path)} target="_blank" rel="noreferrer">
            <div className="aspect-square overflow-hidden rounded border border-border bg-muted">
              <img src={url(r.bucket,r.storage_path)} alt={r.file_name} className="w-full h-full object-cover" />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 truncate">{r.vehicles?.plate} · {r.description || ""}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
