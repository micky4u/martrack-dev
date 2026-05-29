import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Car, Building2, ClipboardCheck, Image,
  ShieldCheck, UserCog, Settings, History, LogOut, User,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

type Item = { title: string; url: string; icon: typeof Car; roles: AppRole[] };

const items: Item[] = [
  { title: "Dashboard", url: "/app", icon: LayoutDashboard, roles: ["root", "coordinador", "supervisor", "empleado"] },
  { title: "Vehículos", url: "/app/vehicles", icon: Car, roles: ["root", "coordinador"] },
  { title: "Mis vehículos", url: "/app/vehicles", icon: Car, roles: ["supervisor"] },
  { title: "Ayuntamientos", url: "/app/municipalities", icon: Building2, roles: ["root", "coordinador"] },
  { title: "Entregas", url: "/app/deliveries", icon: ClipboardCheck, roles: ["root", "coordinador"] },
  { title: "Mis asignaciones", url: "/app/deliveries", icon: ClipboardCheck, roles: ["supervisor"] },
  { title: "Evidencias", url: "/app/evidence", icon: Image, roles: ["root", "coordinador"] },
  { title: "Mis evidencias", url: "/app/evidence", icon: Image, roles: ["supervisor"] },
  { title: "Administración de accesos", url: "/app/access", icon: ShieldCheck, roles: ["root", "coordinador"] },
  { title: "Empleados", url: "/app/employees", icon: UserCog, roles: ["root", "coordinador"] },
  { title: "Mi perfil", url: "/app/profile", icon: User, roles: ["root", "coordinador", "supervisor", "empleado"] },
  { title: "Auditoría", url: "/app/audit", icon: History, roles: ["root"] },
  { title: "Configuración", url: "/app/settings", icon: Settings, roles: ["root"] },
];

export function AppSidebar() {
  const { role, user, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const visible = items.filter((i) => !role || i.roles.includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="px-2 py-3">
          <div className="flex items-baseline gap-1">
            <span className="text-base font-semibold tracking-tight">grup</span>
            <span className="text-base font-light text-muted-foreground">mar.app</span>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">MarTrack PMV</div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((it) => {
                const active = path === it.url || (it.url !== "/app" && path.startsWith(it.url));
                return (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={it.url}>
                        <it.icon className="h-4 w-4" />
                        <span>{it.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="px-2 py-2 space-y-2">
          <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          <div className="text-[10px] uppercase tracking-widest text-foreground/70">{role ?? "—"}</div>
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start"
            onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
          >
            <LogOut className="h-3.5 w-3.5 mr-2" /> Cerrar sesión
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
