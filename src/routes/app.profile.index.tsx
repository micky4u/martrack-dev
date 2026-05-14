import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/app/profile/")({
  head: () => ({ meta: [{ title: "Mi perfil · MarTrack PMV" }] }),
  component: MyProfile,
});

function MyProfile() {
  const { user, role } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [pw, setPw] = useState({ a: "", b: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data));
  }, [user]);

  const changePassword = async () => {
    if (pw.a.length < 8) { toast.error("La contraseña debe tener al menos 8 caracteres."); return; }
    if (pw.a !== pw.b) { toast.error("Las contraseñas no coinciden"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    if (!error) await supabase.from("profiles").update({ must_change_password: false }).eq("id", user!.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setPw({ a: "", b: "" });
    toast.success("Contraseña actualizada");
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Mi perfil</h1>

      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{profile?.full_name ?? "—"}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
          <Badge variant="outline">{role ?? "—"}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm pt-2 border-t">
          <Info k="Cargo" v={profile?.position ?? "—"} />
          <Info k="Teléfono" v={profile?.phone ?? "—"} />
          <Info k="Permiso conducción" v={profile?.driving_license ?? "—"} />
          <Info k="Estado" v={profile?.active ? "Activo" : "Inactivo"} />
        </div>
        {profile?.must_change_password && (
          <div className="text-xs p-2 bg-destructive/10 text-destructive rounded">
            Debes cambiar tu contraseña antes de continuar.
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Cambiar mi contraseña</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label className="text-xs">Nueva contraseña</Label><Input type="password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></div>
          <div><Label className="text-xs">Confirmar</Label><Input type="password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></div>
        </div>
        <div className="flex justify-end pt-2">
          <Button disabled={busy} onClick={changePassword}>{busy ? "Guardando…" : "Cambiar contraseña"}</Button>
        </div>
      </Card>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{k}</div>
      <div>{v}</div>
    </div>
  );
}
