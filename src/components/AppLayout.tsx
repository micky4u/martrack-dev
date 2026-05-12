import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

export function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mustChange, setMustChange] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("must_change_password").eq("id", user.id).maybeSingle()
      .then(({ data }) => setMustChange(!!data?.must_change_password));
  }, [user]);

  useEffect(() => {
    if (mustChange && path !== "/app/profile") navigate({ to: "/app/profile" });
  }, [mustChange, path, navigate]);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Cargando…</div>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border px-3 gap-2">
            <SidebarTrigger />
            <div className="flex-1" />
            <div className="text-xs text-muted-foreground">MarTrack PMV · entorno demo</div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
