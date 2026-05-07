import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/employees/")({
  head: () => ({ meta: [{ title: "Empleados · MarTrack PMV" }] }),
  component: EmployeesList,
});

function EmployeesList() {
  const { role } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const [{ data: profs }, { data: muns }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("municipalities").select("id,name"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const munMap = new Map((muns ?? []).map((m: any) => [m.id, m.name]));
      const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
      setRows((profs ?? []).map((p: any) => ({
        ...p,
        municipality_name: p.municipality_id ? munMap.get(p.municipality_id) : null,
        role: roleMap.get(p.id) ?? "—",
      })));
    })();
  }, []);

  const canManage = role === "root" || role === "coordinador";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empleados</h1>
          <p className="text-sm text-muted-foreground mt-1">{rows.length} empleados</p>
        </div>
        {canManage && (
          <Button asChild>
            <Link to="/app/employees/new"><Plus className="h-4 w-4 mr-1" /> Nuevo empleado</Link>
          </Button>
        )}
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-normal">Nombre</th>
              <th className="text-left px-4 py-2 font-normal">Cargo</th>
              <th className="text-left px-4 py-2 font-normal">Ayuntamiento</th>
              <th className="text-left px-4 py-2 font-normal">Teléfono</th>
              <th className="text-left px-4 py-2 font-normal">Rol</th>
              <th className="text-left px-4 py-2 font-normal">Estado</th>
              <th className="text-right px-4 py-2 font-normal">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-border hover:bg-accent/40">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-4 py-3">{u.position ?? "—"}</td>
                <td className="px-4 py-3">{u.municipality_name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.phone ?? "—"}</td>
                <td className="px-4 py-3"><Badge variant="outline">{u.role}</Badge></td>
                <td className="px-4 py-3">
                  <Badge variant={u.active ? "outline" : "secondary"} className={u.active ? "border-success/40 text-success" : ""}>
                    {u.active ? "Activo" : "Inactivo"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/app/employees/$id" params={{ id: u.id }}><Pencil className="h-3 w-3 mr-1" /> Editar</Link>
                    </Button>
                  ) : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">Sin empleados</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
