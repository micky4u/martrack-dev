import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "No autenticado" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });

    const admin = createClient(url, serviceKey);

    // Check role
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const hasRoot = roles?.some((r: any) => r.role === "root");
    const hasCoord = roles?.some((r: any) => r.role === "coordinador");
    if (!hasRoot && !hasCoord) {
      return new Response(JSON.stringify({ error: "Sin permisos" }), { status: 403, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const body = await req.json();
    const {
      email, password, full_name, phone, position, municipality_id,
      hire_date, driving_license, observations, role,
    } = body;

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: "Email, password y nombre son obligatorios" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const allowedRoles = ["root", "coordinador", "supervisor", "empleado"];
    if (role && !allowedRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Rol inválido" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    // Root puede crear cualquier rol. Coordinador puede crear coordinador, supervisor o empleado, pero no root.
    const safeRole = hasRoot ? (role || "empleado") : (role === "coordinador" || role === "supervisor" || role === "empleado" ? role : "empleado");

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? "Error creando usuario" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const newId = created.user.id;
    // Update profile (created via trigger) with extra fields
    await admin.from("profiles").update({
      full_name, phone, position,
      municipality_id: municipality_id || null,
      hire_date: hire_date || null,
      driving_license, observations, active: true,
    }).eq("id", newId);

    // Set role
    await admin.from("user_roles").delete().eq("user_id", newId);
    await admin.from("user_roles").insert({ user_id: newId, role: safeRole });

    await admin.from("audit_log").insert({
      user_id: user.id,
      entity_type: "employee",
      entity_id: newId,
      action: "empleado_creado",
      description: `Empleado ${full_name} <${email}> creado con rol ${safeRole}`,
    });

    return new Response(JSON.stringify({ id: newId }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
