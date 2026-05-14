import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = ["root", "gerencia", "coordinador", "supervisor"] as const;
type Role = typeof ROLES[number];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "No autenticado" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const callerRole: Role | null =
      callerRoles?.some((r: any) => r.role === "root") ? "root"
      : callerRoles?.some((r: any) => r.role === "coordinador") ? "coordinador"
      : callerRoles?.some((r: any) => r.role === "gerencia") ? "gerencia"
      : callerRoles?.some((r: any) => r.role === "supervisor") ? "supervisor"
      : null;

    const body = await req.json();
    const action: string = body.action;
    const targetId: string | undefined = body.target_user_id;

    const isRoot = callerRole === "root";
    const isCoord = callerRole === "coordinador";

    // helper: get target current role
    const getTargetRole = async (id: string): Promise<Role | null> => {
      const { data } = await admin.from("user_roles").select("role").eq("user_id", id).maybeSingle();
      return (data?.role as Role) ?? null;
    };

    const audit = async (entity_id: string, act: string, description: string, metadata: Record<string, unknown> = {}) => {
      await admin.from("audit_log").insert({
        user_id: user.id, entity_type: "user_access", entity_id, action: act,
        description, metadata: metadata as never,
      });
    };

    switch (action) {
      case "set_password": {
        if (!isRoot) return json({ error: "Sin permisos" }, 403);
        const { password } = body;
        if (!password || password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
        const { error } = await admin.auth.admin.updateUserById(targetId!, { password });
        if (error) return json({ error: error.message }, 400);
        await admin.from("profiles").update({ must_change_password: false }).eq("id", targetId!);
        await audit(targetId!, "password_reseteada", "Contraseña cambiada por administración");
        return json({ ok: true });
      }

      case "send_reset": {
        if (!isRoot && !isCoord) return json({ error: "Sin permisos" }, 403);
        const tRole = await getTargetRole(targetId!);
        if (isCoord && tRole && tRole !== "supervisor") return json({ error: "Coordinador solo puede resetear supervisores." }, 403);
        const { data: prof } = await admin.from("profiles").select("email").eq("id", targetId!).maybeSingle();
        if (!prof?.email) return json({ error: "Empleado sin email" }, 400);
        const redirectTo = body.redirect_to || `${url}`;
        const { error } = await admin.auth.resetPasswordForEmail(prof.email, { redirectTo });
        if (error) return json({ error: error.message }, 400);
        await audit(targetId!, "password_reseteada", `Email de recuperación enviado a ${prof.email}`);
        return json({ ok: true });
      }

      case "set_role": {
        const { role: newRole } = body;
        if (!ROLES.includes(newRole)) return json({ error: "Rol inválido" }, 400);
        if (!isRoot && !(isCoord && newRole === "supervisor")) return json({ error: "Sin permisos para asignar este rol" }, 403);
        const tRole = await getTargetRole(targetId!);
        if (isCoord && tRole && tRole !== "supervisor") return json({ error: "Coordinador solo puede modificar supervisores." }, 403);
        if (tRole === newRole) return json({ ok: true, unchanged: true });
        await admin.from("user_roles").delete().eq("user_id", targetId!);
        const { error } = await admin.from("user_roles").insert({ user_id: targetId!, role: newRole });
        if (error) return json({ error: error.message }, 400);
        await audit(targetId!, "rol_cambiado", `Rol cambiado de ${tRole ?? "—"} a ${newRole}`, { old: tRole, new: newRole });
        return json({ ok: true });
      }

      case "ban": {
        if (!isRoot) return json({ error: "Sin permisos" }, 403);
        if (targetId === user.id) return json({ error: "No puedes bloquearte a ti mismo." }, 400);
        const { error } = await admin.auth.admin.updateUserById(targetId!, { ban_duration: "876000h" }); // ~100 años
        if (error) return json({ error: error.message }, 400);
        await audit(targetId!, "acceso_bloqueado", "Acceso bloqueado por administración");
        return json({ ok: true });
      }

      case "unban": {
        if (!isRoot) return json({ error: "Sin permisos" }, 403);
        const { error } = await admin.auth.admin.updateUserById(targetId!, { ban_duration: "none" });
        if (error) return json({ error: error.message }, 400);
        await audit(targetId!, "acceso_reactivado", "Acceso reactivado");
        return json({ ok: true });
      }

      case "update_email": {
        if (!isRoot) return json({ error: "Sin permisos" }, 403);
        const { email } = body;
        if (!email) return json({ error: "Email requerido" }, 400);
        const { error } = await admin.auth.admin.updateUserById(targetId!, { email, email_confirm: true });
        if (error) return json({ error: error.message }, 400);
        await admin.from("profiles").update({ email }).eq("id", targetId!);
        await audit(targetId!, "acceso_actualizado", `Email cambiado a ${email}`);
        return json({ ok: true });
      }

      case "force_password_change": {
        if (!isRoot && !isCoord) return json({ error: "Sin permisos" }, 403);
        await admin.from("profiles").update({ must_change_password: true }).eq("id", targetId!);
        await audit(targetId!, "acceso_actualizado", "Forzar cambio de contraseña en próximo inicio");
        return json({ ok: true });
      }

      case "disable_employee": {
        if (!isRoot && !isCoord) return json({ error: "Sin permisos" }, 403);
        const tRole = await getTargetRole(targetId!);
        if (isCoord && tRole && tRole !== "supervisor") return json({ error: "Coordinador solo puede desactivar supervisores." }, 403);
        const reason = body.reason || null;
        const { error } = await admin.from("profiles").update({
          active: false, disabled_at: new Date().toISOString(), disabled_by: user.id, disabled_reason: reason,
        }).eq("id", targetId!);
        if (error) return json({ error: error.message }, 400);
        // also ban auth so cannot login
        await admin.auth.admin.updateUserById(targetId!, { ban_duration: "876000h" }).catch(() => {});
        await audit(targetId!, "empleado_desactivado", reason ?? "Empleado desactivado");
        return json({ ok: true });
      }

      case "enable_employee": {
        if (!isRoot && !isCoord) return json({ error: "Sin permisos" }, 403);
        const { error } = await admin.from("profiles").update({
          active: true, disabled_at: null, disabled_by: null, disabled_reason: null,
        }).eq("id", targetId!);
        if (error) return json({ error: error.message }, 400);
        await admin.auth.admin.updateUserById(targetId!, { ban_duration: "none" }).catch(() => {});
        await audit(targetId!, "empleado_actualizado", "Empleado reactivado");
        return json({ ok: true });
      }

      case "list_access_overview": {
        if (!isRoot && !isCoord && callerRole !== "gerencia") return json({ error: "Sin permisos" }, 403);
        const ids: string[] = body.ids ?? [];
        if (!ids.length) return json({ users: [] });
        // Fetch all roles for these users (priority: root > gerencia > coordinador > supervisor)
        const { data: roleRows } = await admin.from("user_roles").select("user_id,role").in("user_id", ids);
        const priority: Record<string, number> = { root: 1, gerencia: 2, coordinador: 3, supervisor: 4 };
        const rolesByUser = new Map<string, string>();
        for (const r of (roleRows ?? []) as Array<{ user_id: string; role: string }>) {
          const cur = rolesByUser.get(r.user_id);
          if (!cur || (priority[r.role] ?? 99) < (priority[cur] ?? 99)) {
            rolesByUser.set(r.user_id, r.role);
          }
        }
        const out: Array<{ id: string; last_sign_in_at: string | null; banned_until: string | null; email: string | null; role: string | null }> = [];
        for (const id of ids) {
          const { data, error } = await admin.auth.admin.getUserById(id);
          if (!error && data?.user) {
            out.push({
              id,
              last_sign_in_at: data.user.last_sign_in_at ?? null,
              banned_until: (data.user as any).banned_until ?? null,
              email: data.user.email ?? null,
              role: rolesByUser.get(id) ?? null,
            });
          } else {
            out.push({ id, last_sign_in_at: null, banned_until: null, email: null, role: rolesByUser.get(id) ?? null });
          }
        }
        return json({ users: out });
      }

      default:
        return json({ error: "Acción no soportada" }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
