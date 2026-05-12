# Plan — Administración de accesos MarTrack PMV

## Diagnóstico

Hoy existe `app.employees.*` (CRUD básico de perfiles) y `app.users.*` (solo lectura). Los huecos:

1. No hay **cambiar contraseña** ni **reset** desde admin.
2. No hay **bloqueo de acceso** (Supabase Auth `ban_duration` no se usa).
3. No hay **forzar cambio de contraseña** en primer login.
4. No hay **última fecha de acceso** visible.
5. La tabla actual de empleados no muestra estado del acceso (banned/active).
6. `create-employee` edge function existe pero solo crea; falta `update-employee-access` para cambiar password / rol / ban / email.
7. No hay pantalla de "Mi perfil" + "Cambiar mi contraseña" para supervisor.
8. Auditoría: faltan acciones `password_reseteada`, `acceso_bloqueado`, `acceso_reactivado`, `rol_cambiado`.

## Cambios de base de datos (mínimos, aditivos)

Una sola migración aditiva, **no destructiva**:

- `profiles`: añadir `disabled_at timestamptz`, `disabled_by uuid`, `disabled_reason text`, `must_change_password boolean default false`.
- Vista `v_user_access` (read-only) que une `profiles` + `user_roles` + `auth.users` (last_sign_in_at, banned_until, email_confirmed_at) vía SECURITY DEFINER function `get_user_access_overview()` que solo retorna filas si el caller es root/coordinador/gerencia.
- Función SECURITY DEFINER `count_active_roots()` para validar "no eliminar último root".
- Trigger en `user_roles` que bloquea quitar el último rol root activo.

No se tocan: `auth.*`, `storage.*`, tablas existentes con datos.

## Nueva edge function: `manage-user-access`

Una sola function con acciones (POST `{ action, ...payload }`):

- `set_password` — root cambia password de cualquier user (admin.updateUserById).
- `send_reset` — envía email recovery (admin.generateLink type=recovery) o `resetPasswordForEmail`.
- `set_role` — cambia rol en `user_roles` (root only; valida no quitar último root).
- `ban` / `unban` — `auth.admin.updateUserById({ ban_duration })` (root only).
- `update_email` — cambia email en auth + profile (root only).
- `disable_employee` / `enable_employee` — soft delete: `active=false` + `disabled_at/by/reason` + ban auth.
- `force_password_change` — set `must_change_password=true`.

Cada acción valida rol del caller con service client + escribe `audit_log` con `actor_user_id`, `entity_type`, `entity_id`, `action`, `description`, `metadata` (old/new).

Coordinador puede: crear/editar empleados operativos, set_role solo a `supervisor`, send_reset a supervisores. NO puede: ban, set_password, cambiar root/gerencia, set_role a root/gerencia/coordinador.

## Frontend — pantallas

Renombrar/expandir el módulo:

1. **`app.access.index.tsx`** — Nueva pantalla "Administración de accesos". Tabla unificada con: nombre, email, rol, cargo, ayuntamiento, estado empleado, estado acceso (Activo/Bloqueado/Sin acceso), último login, creación, menú de acciones (DropdownMenu).
2. **`app.access.$id.tsx`** — Detalle: tabs **Datos del empleado** | **Acceso** | **Auditoría del usuario**. Acciones: cambiar password (Dialog), reset por email, cambiar rol (Select), ban/unban toggle, forzar cambio password, desactivar empleado (con motivo), reactivar.
3. **`app.access.new.tsx`** — Wizard 3 pasos (Datos → Acceso → Confirmación) con dos botones finales: "Crear empleado y acceso" y "Guardar empleado sin acceso".
4. **`app.profile.index.tsx`** — Mi perfil + cambiar mi contraseña (`supabase.auth.updateUser({password})`); visible para todos.
5. Sidebar: añadir "Administración de accesos" (root/coord/gerencia), "Mi perfil" (todos). Mantener `app.users` y `app.employees` redirigiendo a `app.access` para no romper enlaces.

Permisos en UI: gerencia ve sin botones de mutación. Supervisor solo ve su perfil.

## Validaciones cliente (zod)

Email válido, password ≥ 8 chars, confirmación coincide, rol obligatorio para crear acceso, mensajes exactos del brief.

## Archivos a crear/editar

**SQL migración:** 1 archivo aditivo.
**Edge function nueva:** `supabase/functions/manage-user-access/index.ts`.
**Edge function existente:** ampliar `create-employee` para soportar `must_change_password` y `skip_auth` (empleado sin acceso → genera UUID local sin auth).
**Frontend nuevo:** `app.access.index.tsx`, `app.access.$id.tsx`, `app.access.new.tsx`, `app.profile.index.tsx`, `components/PasswordDialog.tsx`, `components/RoleSelector.tsx`.
**Frontend editado:** `AppSidebar.tsx`, `audit.ts` (ampliar acciones), `app.employees.index.tsx` (redirige a access), `app.users.index.tsx` (redirige).

## Riesgos

- "Empleado sin acceso" requiere que `profiles.id` no tenga FK a `auth.users` — verificaré con `read_query`. Si la tiene, creamos tabla auxiliar `employees_no_auth` o relajamos. Plan A: usar columna nueva `auth_user_id` opcional + permitir `profiles.id` independiente. **Confirmaré antes de aplicar.**
- HIBP ya activado — passwords débiles serán rechazados por Supabase, mostrar error legible.

## Checklist de pruebas (al terminar)

1. root crea empleado SIN acceso → aparece en lista, no puede login.
2. root crea empleado CON acceso → user puede login con email/password.
3. root cambia password de supervisor → supervisor login con nueva.
4. root envía reset → supervisor recibe email.
5. root cambia rol supervisor→coordinador → reflejado en sidebar tras re-login.
6. root banea acceso → login bloqueado.
7. root reactiva → login OK.
8. coord no ve botón "ban" ni "set role root".
9. gerencia no ve botones de mutación.
10. supervisor solo ve "/app/profile".
11. Intentar quitar último root → bloqueado por trigger.
12. Auditoría muestra todas las acciones con old→new.

## ¿Apruebas?

Necesito confirmación para:
1. Aplicar la migración aditiva (4 columnas a `profiles` + función + trigger) — **no destructiva**.
2. Crear/desplegar la edge function `manage-user-access`.
3. Crear las 4 pantallas nuevas y reemplazar el módulo de Usuarios actual.

Responde **"adelante"** para ejecutar todo en una sola pasada.
