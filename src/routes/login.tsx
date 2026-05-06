import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Acceso · MarTrack PMV" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user, signIn, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/app" });
  }, [user, loading, navigate]);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) toast.error("No se pudo iniciar sesión", { description: error });
    else navigate({ to: "/app" });
  };

  const fillDemo = (e: string) => { setEmail(e); setPassword("demo1234"); };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-baseline gap-1">
            <span className="text-2xl font-semibold tracking-tight">grup</span>
            <span className="text-2xl font-light text-muted-foreground">mar.app</span>
          </div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mt-2">MarTrack PMV</div>
        </div>

        <form onSubmit={handle} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-normal text-muted-foreground">Correo electrónico</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="h-11 border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground bg-transparent shadow-none" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-normal text-muted-foreground">Contraseña</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="h-11 border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-foreground bg-transparent shadow-none" />
          </div>
          <Button type="submit" disabled={busy} className="w-full h-11 mt-6">
            {busy ? "Accediendo…" : "Acceder"}
          </Button>
        </form>

        <div className="mt-10 pt-6 border-t border-border">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Usuarios demo (contraseña: demo1234)</div>
          <div className="grid grid-cols-2 gap-1.5">
            {["root@demo.com","gerencia@demo.com","coordinador@demo.com","supervisor@demo.com"].map((e) => (
              <button key={e} type="button" onClick={() => fillDemo(e)}
                className="text-[11px] text-left px-2 py-1.5 rounded border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground">
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
