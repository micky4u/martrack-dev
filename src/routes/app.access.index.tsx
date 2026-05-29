import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MoreHorizontal, Plus, Search, ShieldAlert, KeyRound, Mail, Lock, Unlock, UserCog, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/access/")({
  head: () => ({ meta: [{ title: "Administración de accesos · MarTrack PMV" }] }),
  component: AccessAdmin,
});

type Row = {
  id: string;
  full_name: string | null;
  email: string | null;
  position: string | null;
  municipality_name: string | null;
  active: boolean;
  created_at: string;
  role: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
};

function AccessAdmin() {
  const { role: myRole, user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<Row | null>(null);
  const [dialog, setDialog] = useState<null | "password" | "role" | "email" | "disable" | "delete-confirm">(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ a: "", b: "" });
  const [newRole, setNewRole] = useState<string>("supervisor");
  const [newEmail, setNewEmail] = useState("");
  const [reason, setReason] = useState("");

  const isRoot = myRole === "root";
  const isCoord = myRole === "coordinador";
  const canRead = isRoot || isCoord;

  const load = async () => {
    setLoading(true);
    const [{ data: profs }, { data: muns }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("municipalities").select("id,name"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    const munMap = new Map((muns ?? []).map((m: any) => [m.id, m.name]));
    // Priority: root > gerencia > coordinador > supervisor (in case a user has multiple roles)
    const priority: Record<string, number> = { root: 1, coordinador: 2, supervisor: 3, empleado: 4, gerencia: 99 };
    const roleMap = new Map<string, string>();
    for (const r of (roles ?? []) as Array<{ user_id: string; role: string }>) {
      const cur = roleMap.get(r.user_id);
      if (!cur || (priority[r.role] ?? 99) < (priority[cur] ?? 99)) {
        roleMap.set(r.user_id, r.role);
      }
    }
    const base: Row[] = (profs ?? []).map((p: any) => ({
      id: p.id, full_name: p.full_name, email: p.email, position: p.position,
      municipality_name: p.municipality_id ? munMap.get(p.municipality_id) ?? null : null,
      active: p.active, created_at: p.created_at,
      role: roleMap.get(p.id) ?? "—",
      last_sign_in_at: null, banned_until: null,
    }));

    // Enrich with auth metadata + roles via edge function (role visibility falls back here
    // because user_roles RLS only lets root read other users' rows).
    if (canRead && base.length) {
      const { data } = await supabase.functions.invoke("manage-user-access", {
        body: { action: "list_access_overview", ids: base.map(r => r.id) },
      });
      const map = new Map<string, any>(((data as any)?.users ?? []).map((u: any) => [u.id, u]));
      base.forEach(r => {
        const m = map.get(r.id);
        if (m) {
          r.last_sign_in_at = m.last_sign_in_at;
          r.banned_until = m.banned_until;
          if (m.role) r.role = m.role;
        }
      });
    }
    setRows(base);
    setLoading(false);
  };

  useEffect(() => { if (canRead) load(); }, [canRead]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      (r.full_name ?? "").toLowerCase().includes(s) ||
      (r.email ?? "").toLowerCase().includes(s) ||
      (r.position ?? "").toLowerCase().includes(s) ||
      r.role.toLowerCase().includes(s)
    );
  }, [rows, q]);

  const accessState = (r: Row) => {
    if (!r.active) return { label: "Empleado inactivo", cls: "" };
    if (r.banned_until && new Date(r.banned_until) > new Date()) return { label: "Bloqueado", cls: "border-destructive/40 text-destructive" };
    return { label: "Activo", cls: "border-success/40 text-success" };
  };

  const callApi = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("manage-user-access", { body });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Error");
      return false;
    }
    toast.success(success);
    setDialog(null); setPw({ a: "", b: "" }); setReason("");
    await load();
    return true;
  };

  if (!canRead) return <div className="text-sm text-muted-foreground">Sin permisos para administrar accesos.</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Administración de accesos</h1>
          <p className="text-sm text-muted-foreground mt-1">{rows.length} usuarios · {rows.filter(r => r.active).length} activos</p>
        </div>
        {(isRoot || isCoord) && (
          <Button asChild>
            <Link to="/app/access/new"><Plus className="h-4 w-4 mr-1" /> Nuevo empleado con acceso</Link>
          </Button>
        )}
      </div>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, email, cargo o rol…" className="pl-9 border-0 shadow-none focus-visible:ring-0" />
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-normal">Usuario</th>
              <th className="text-left px-4 py-2 font-normal">Rol</th>
              <th className="text-left px-4 py-2 font-normal">Cargo / Ayuntamiento</th>
              <th className="text-left px-4 py-2 font-normal">Estado empleado</th>
              <th className="text-left px-4 py-2 font-normal">Estado acceso</th>
              <th className="text-left px-4 py-2 font-normal">Último acceso</th>
              <th className="text-left px-4 py-2 font-normal">Alta</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Cargando…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-sm text-muted-foreground">Sin resultados</td></tr>
            )}
            {filtered.map((r) => {
              const acc = accessState(r);
              const tRole = r.role;
              const canActOnRole = isRoot || (isCoord && tRole !== "root");
              const isSelf = user?.id === r.id;
              return (
                <tr key={r.id} className="border-t border-border hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </td>
                  <td className="px-4 py-3"><Badge variant="outline">{tRole}</Badge></td>
                  <td className="px-4 py-3">
                    <div>{r.position ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.municipality_name ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={r.active ? "outline" : "secondary"} className={r.active ? "border-success/40 text-success" : ""}>
                      {r.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={acc.cls}>{acc.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.last_sign_in_at ? new Date(r.last_sign_in_at).toLocaleString() : "Nunca"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel className="text-xs">{r.full_name}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link to="/app/employees/$id" params={{ id: r.id }}><UserCog className="h-3.5 w-3.5 mr-2" /> Editar empleado</Link>
                          </DropdownMenuItem>
                          {canActOnRole && (
                            <DropdownMenuItem onClick={() => { setTarget(r); setNewRole(tRole === "—" ? "supervisor" : tRole); setDialog("role"); }}>
                              <UserCog className="h-3.5 w-3.5 mr-2" /> Cambiar rol
                            </DropdownMenuItem>
                          )}
                          {(isRoot || (isCoord && tRole !== "root")) && (
                            <DropdownMenuItem onClick={() => { setTarget(r); setPw({ a: "", b: "" }); setDialog("password"); }}>
                              <KeyRound className="h-3.5 w-3.5 mr-2" /> Cambiar contraseña
                            </DropdownMenuItem>
                          )}
                          {(isRoot || (isCoord && tRole !== "root")) && (
                            <DropdownMenuItem onClick={() => { setTarget(r); callApi({ action: "send_reset", target_user_id: r.id }, "Email de recuperación enviado"); }}>
                              <Mail className="h-3.5 w-3.5 mr-2" /> Enviar email de reset
                            </DropdownMenuItem>
                          )}
                          {isRoot && (
                            <DropdownMenuItem onClick={() => { setTarget(r); setNewEmail(r.email ?? ""); setDialog("email"); }}>
                              <Mail className="h-3.5 w-3.5 mr-2" /> Cambiar email
                            </DropdownMenuItem>
                          )}
                          {isRoot && !isSelf && (
                            r.banned_until && new Date(r.banned_until) > new Date() ? (
                              <DropdownMenuItem onClick={() => callApi({ action: "unban", target_user_id: r.id }, "Acceso reactivado")}>
                                <Unlock className="h-3.5 w-3.5 mr-2" /> Desbloquear acceso
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => callApi({ action: "ban", target_user_id: r.id }, "Acceso bloqueado")}>
                                <Lock className="h-3.5 w-3.5 mr-2" /> Bloquear acceso
                              </DropdownMenuItem>
                            )
                          )}
                          <DropdownMenuSeparator />
                          {r.active ? (
                            !isSelf && canActOnRole && (
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setTarget(r); setReason(""); setDialog("disable"); }}>
                                <UserX className="h-3.5 w-3.5 mr-2" /> Desactivar empleado
                              </DropdownMenuItem>
                            )
                          ) : (
                            canActOnRole && (
                              <DropdownMenuItem onClick={() => callApi({ action: "enable_employee", target_user_id: r.id }, "Empleado reactivado")}>
                                <UserCheck className="h-3.5 w-3.5 mr-2" /> Reactivar empleado
                              </DropdownMenuItem>
                            )
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Cambiar contraseña */}
      <Dialog open={dialog === "password"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>{target?.full_name} · {target?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nueva contraseña</Label><Input type="password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></div>
            <div><Label className="text-xs">Confirmar</Label><Input type="password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></div>
            <p className="text-[11px] text-muted-foreground">Mínimo 8 caracteres. La nueva contraseña reemplaza la actual de forma inmediata.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button disabled={busy} onClick={() => {
              if (pw.a.length < 8) { toast.error("La contraseña debe tener al menos 8 caracteres."); return; }
              if (pw.a !== pw.b) { toast.error("Las contraseñas no coinciden"); return; }
              callApi({ action: "set_password", target_user_id: target!.id, password: pw.a }, "Contraseña actualizada");
            }}>{busy ? "Guardando…" : "Cambiar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cambiar rol */}
      <Dialog open={dialog === "role"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar rol</DialogTitle>
            <DialogDescription>{target?.full_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Nuevo rol</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(isRoot ? ["root", "coordinador", "supervisor", "empleado"] : ["coordinador", "supervisor", "empleado"]).map(x => (
                  <SelectItem key={x} value={x}>{x}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isRoot && <p className="text-[11px] text-muted-foreground">Coordinador puede asignar coordinador, supervisor o empleado; no Root.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button disabled={busy} onClick={() => {
              if (!newRole) { toast.error("Selecciona un rol antes de crear el acceso."); return; }
              callApi({ action: "set_role", target_user_id: target!.id, role: newRole }, "Rol actualizado");
            }}>{busy ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cambiar email */}
      <Dialog open={dialog === "email"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar email de acceso</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Nuevo email</Label>
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button disabled={busy} onClick={() => {
              if (!newEmail.includes("@")) { toast.error("Email inválido"); return; }
              callApi({ action: "update_email", target_user_id: target!.id, email: newEmail }, "Email actualizado");
            }}>{busy ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Desactivar */}
      <Dialog open={dialog === "disable"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle><ShieldAlert className="inline h-4 w-4 mr-1 text-destructive" /> Desactivar empleado</DialogTitle>
            <DialogDescription>{target?.full_name} · El acceso será bloqueado simultáneamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Motivo (opcional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Baja, traslado, fin de contrato…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={busy} onClick={() => callApi({ action: "disable_employee", target_user_id: target!.id, reason }, "Empleado desactivado")}>
              {busy ? "Procesando…" : "Desactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
