import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = ["root", "coordinador", "supervisor", "empleado"] as const;
type Role = typeof ROLES[number] | "gerencia";
const ROLE_PRIORITY: Record<string, number> = { root: 1, coordinador: 2, supervisor: 3, empleado: 4, gerencia: 99 };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function pickHighestRole(rows: Array<{ role: string }> | null | undefined): Role | null {
  if (!rows?.length) return null;
  return rows.map((r) => r.role).sort((a, b) => (ROLE_PRIORITY[a] ?? 999) - (ROLE_PRIORITY[b] ?? 999))[0] as Role;
}

function canActorManageTarget(actor: Role | null, target: Role | null) {
  if (actor === "root") return true;
  if (actor !== "coordinador") return false;
  return target !== "root";
}

function canActorSetRole(actor: Role | null, target: Role | null, next: Role) {
  if (actor === "root") return ROLES.includes(next as any);
  if (actor !== "coordinador") return false;
  if (target === "root" || next === "root") return false;
  return ["coordinador", "supervisor", "empleado"].includes(next);
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
    const callerRole = pickHighestRole(callerRoles as any);
    const isRoot = callerRole === "root";
    const isCoord = callerRole === "coordinador";

    const body = await req.json();
    const action: string = body.action;
    const targetId: string | undefined = body.target_user_id;

    const getTargetRole = async (id: string): Promise<Role | null> => {
      const { data } = await admin.from("user_roles").select("role").eq("user_id", id);
      return pickHighestRole(data as any);
    };

    const requireTarget = () => {
      if (!targetId) throw new Error("target_user_id requerido");
      return targetId;
    };

    const audit = async (entity_id: string, act: string, description: string, metadata: Record<string, unknown> = {}) => {
      await admin.from("audit_log").insert({
        user_id: user.id,
        entity_type: "user_access",
        entity_id,
        action: act,
        description,
        metadata: metadata as never,
      });
    };

    switch (action) {
      case "set_password": {
        const id = requireTarget();
        const tRole = await getTargetRole(id);
        if (!canActorManageTarget(callerRole, tRole)) return json({ error: "Sin permisos para cambiar la contraseña de este usuario" }, 403);
        const { password } = body;
        if (!password || password.length < 8) return json({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
        const { error } = await admin.auth.admin.updateUserById(id, { password });
        if (error) return json({ error: error.message }, 400);
        await admin.from("profiles").update({ must_change_password: false }).eq("id", id);
        await audit(id, "password_reseteada", "Contraseña cambiada por administración", { target_role: tRole });
        return json({ ok: true });
      }

      case "send_reset": {
        const id = requireTarget();
        const tRole = await getTargetRole(id);
        if (!canActorManageTarget(callerRole, tRole)) return json({ error: "Sin permisos para resetear este usuario" }, 403);
        const { data: prof } = await admin.from("profiles").select("email").eq("id", id).maybeSingle();
        if (!prof?.email) return json({ error: "Empleado sin email" }, 400);
        const redirectTo = body.redirect_to || `${url}`;
        const { error } = await admin.auth.resetPasswordForEmail(prof.email, { redirectTo });
        if (error) return json({ error: error.message }, 400);
        await audit(id, "password_reseteada", `Email de recuperación enviado a ${prof.email}`);
        return json({ ok: true });
      }

      case "set_role": {
        const id = requireTarget();
        const nextRole = String(body.role ?? "") as Role;
        if (!ROLES.includes(nextRole as any)) return json({ error: "Rol inválido" }, 400);
        const tRole = await getTargetRole(id);
        if (!canActorSetRole(callerRole, tRole, nextRole)) return json({ error: "Sin permisos para asignar este rol" }, 403);
        if (tRole === nextRole) return json({ ok: true, unchanged: true });
        await admin.from("user_roles").delete().eq("user_id", id);
        const { error } = await admin.from("user_roles").insert({ user_id: id, role: nextRole as any });
        if (error) return json({ error: error.message }, 400);
        await audit(id, "rol_cambiado", `Rol cambiado de ${tRole ?? "—"} a ${nextRole}`, { old: tRole, new: nextRole });
        return json({ ok: true });
      }

      case "ban": {
        const id = requireTarget();
        if (!isRoot) return json({ error: "Sin permisos" }, 403);
        if (id === user.id) return json({ error: "No puedes bloquearte a ti mismo." }, 400);
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
        if (error) return json({ error: error.message }, 400);
        await audit(id, "acceso_bloqueado", "Acceso bloqueado por administración");
        return json({ ok: true });
      }

      case "unban": {
        const id = requireTarget();
        if (!isRoot) return json({ error: "Sin permisos" }, 403);
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
        if (error) return json({ error: error.message }, 400);
        await audit(id, "acceso_reactivado", "Acceso reactivado");
        return json({ ok: true });
      }

      case "update_email": {
        const id = requireTarget();
        if (!isRoot) return json({ error: "Sin permisos" }, 403);
        const { email } = body;
        if (!email) return json({ error: "Email requerido" }, 400);
        const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
        if (error) return json({ error: error.message }, 400);
        await admin.from("profiles").update({ email }).eq("id", id);
        await audit(id, "acceso_actualizado", `Email cambiado a ${email}`);
        return json({ ok: true });
      }

      case "force_password_change": {
        const id = requireTarget();
        const tRole = await getTargetRole(id);
        if (!canActorManageTarget(callerRole, tRole)) return json({ error: "Sin permisos" }, 403);
        await admin.from("profiles").update({ must_change_password: true }).eq("id", id);
        await audit(id, "acceso_actualizado", "Forzar cambio de contraseña en próximo inicio");
        return json({ ok: true });
      }

      case "disable_employee": {
        const id = requireTarget();
        const tRole = await getTargetRole(id);
        if (!canActorManageTarget(callerRole, tRole)) return json({ error: "Sin permisos" }, 403);
        const reason = body.reason || null;
        const { error } = await admin.from("profiles").update({
          active: false,
          disabled_at: new Date().toISOString(),
          disabled_by: user.id,
          disabled_reason: reason,
        }).eq("id", id);
        if (error) return json({ error: error.message }, 400);
        await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" }).catch(() => {});
        await audit(id, "empleado_desactivado", reason ?? "Empleado desactivado");
        return json({ ok: true });
      }

      case "enable_employee": {
        const id = requireTarget();
        const tRole = await getTargetRole(id);
        if (!canActorManageTarget(callerRole, tRole)) return json({ error: "Sin permisos" }, 403);
        const { error } = await admin.from("profiles").update({
          active: true,
          disabled_at: null,
          disabled_by: null,
          disabled_reason: null,
        }).eq("id", id);
        if (error) return json({ error: error.message }, 400);
        await admin.auth.admin.updateUserById(id, { ban_duration: "none" }).catch(() => {});
        await audit(id, "empleado_actualizado", "Empleado reactivado");
        return json({ ok: true });
      }

      case "list_access_overview": {
        if (!isRoot && !isCoord && callerRole !== "gerencia") return json({ error: "Sin permisos" }, 403);
        const ids: string[] = body.ids ?? [];
        if (!ids.length) return json({ users: [] });
        const { data: roleRows } = await admin.from("user_roles").select("user_id,role").in("user_id", ids);
        const rolesByUser = new Map<string, string>();
        for (const r of (roleRows ?? []) as Array<{ user_id: string; role: string }>) {
          const cur = rolesByUser.get(r.user_id);
          if (!cur || (ROLE_PRIORITY[r.role] ?? 999) < (ROLE_PRIORITY[cur] ?? 999)) rolesByUser.set(r.user_id, r.role);
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
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
