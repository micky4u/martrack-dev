import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/settings/")({
  head: () => ({ meta: [{ title: "Configuración · MarTrack PMV" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, role } = useAuth();
  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">Información del entorno y cuenta</p>
      </div>
      <Card className="p-5 space-y-3 text-sm">
        <Row l="Usuario" v={user?.email} />
        <Row l="Rol activo" v={role} />
        <Row l="Entorno" v="Demo · datos sintéticos" />
        <Row l="Aplicación" v="MarTrack PMV · grup mar.app" />
      </Card>
      <Card className="p-5 space-y-2 text-sm">
        <h2 className="font-semibold mb-2">Buckets de almacenamiento</h2>
        <ul className="text-xs space-y-1 text-muted-foreground">
          <li>· vehicle-photos — fotografías del vehículo</li>
          <li>· vehicle-documents — documentación adjunta</li>
          <li>· signatures — firmas digitales de aceptación</li>
        </ul>
      </Card>
    </div>
  );
}
function Row({l,v}:{l:string;v:any}) {
  return <div className="flex justify-between border-b border-border last:border-0 pb-2"><span className="text-muted-foreground">{l}</span><span>{v ?? "—"}</span></div>;
}
