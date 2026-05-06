import { Badge } from "@/components/ui/badge";

const map: Record<string, { label: string; cls: string }> = {
  disponible: { label: "Disponible", cls: "bg-success/15 text-success border-success/30" },
  asignado: { label: "Asignado", cls: "bg-info/15 text-info border-info/30" },
  en_revision: { label: "En revisión", cls: "bg-warning/20 text-warning-foreground border-warning/40" },
  baja: { label: "Baja", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  borrador: { label: "Borrador", cls: "bg-muted text-muted-foreground border-border" },
  evidencias_pendientes: { label: "Evidencias pendientes", cls: "bg-warning/20 text-warning-foreground border-warning/40" },
  pendiente_supervisor: { label: "Pendiente supervisor", cls: "bg-warning/20 text-warning-foreground border-warning/40" },
  pendiente_firma: { label: "Pendiente firma", cls: "bg-info/15 text-info border-info/30" },
  firmado: { label: "Firmado", cls: "bg-success/15 text-success border-success/30" },
  cerrado: { label: "Cerrado", cls: "bg-foreground/10 text-foreground border-foreground/20" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={`font-normal ${m.cls}`}>{m.label}</Badge>;
}
