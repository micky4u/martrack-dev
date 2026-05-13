
# Plan correctivo MarTrack PMV — Permisos, flujo de asignación y cierre

> Diagnóstico previo. **Ninguna migración se aplicará sin tu aprobación explícita.** Cambios SQL son aditivos (políticas RLS, triggers, columna `current_responsible_employee_id`); no se elimina ningún dato ni columna.

---

## 1. Diagnóstico — causa raíz por problema

| # | Problema reportado | Causa raíz detectada |
|---|---|---|
| 1 | Supervisor ve todo | RLS abiertos: `vehicles`, `vehicle_deliveries`, `vehicle_evidence`, `municipalities`, `delivery_signatures` tienen `USING (true)` para SELECT. Sidebar solo oculta items pero los datos siguen accesibles por URL/consulta. |
| 2 | Coordinador no puede asignar coche con flujo claro | El selector de supervisores ya existe en `app.deliveries.$id.tsx`, pero **no hay flujo "Asignar vehículo" desde el detalle de vehículo** que cree la entrega y enlace al supervisor en un solo paso. La creación de entregas (`app.deliveries.new`) no existe como wizard. |
| 3 | Supervisor sin opción clara para terminar el proceso | El detalle de entrega muestra el botón "Firmar entrega" solo si `status === 'pendiente_firma'`. Las entregas nuevas nacen en `borrador`/`evidencias_pendientes` y nunca avanzan automáticamente. No hay botón "Finalizar asignación" tras la firma para el supervisor (solo coordinador puede cerrar). |
| 4 | Flujo incompleto | Falta: (a) transición automática de estado tras subir evidencias, (b) acción "Finalizar" para supervisor, (c) actualización de `vehicles.responsible_user_id` al cerrar, (d) bloqueo de cambios post-cierre. |

---

## 2. Cambios de base de datos (aditivos, requieren aprobación)

### 2.1 RLS — endurecer SELECT por rol

**Tablas afectadas:** `vehicles`, `vehicle_deliveries`, `vehicle_evidence`, `delivery_signatures`, `profiles`, `audit_log`, `municipalities`.

Nuevas políticas SELECT (reemplazan las `USING (true)` actuales):

- **vehicles**: root/gerencia/coordinador → todos. Supervisor → solo donde `responsible_user_id = auth.uid()` **OR** existe `vehicle_deliveries` con `supervisor_id = auth.uid()` activa o histórica suya.
- **vehicle_deliveries**: root/gerencia/coordinador → todos. Supervisor → solo donde `supervisor_id = auth.uid()`.
- **vehicle_evidence**: root/gerencia/coordinador → todos. Supervisor → solo evidencias de vehículos cuyas entregas él supervisa (subquery a `vehicle_deliveries`).
- **delivery_signatures**: root/gerencia/coordinador → todos. Supervisor → solo donde `signed_by = auth.uid()` o entrega suya.
- **profiles**: supervisor → solo su propio registro (ya casi correcto, mantener).
- **audit_log**: solo root/gerencia/coordinador. Supervisor sin acceso.
- **municipalities**: mantener lectura pública autenticada (necesario para mostrar nombres) pero ocultar listado del menú al supervisor.

### 2.2 Nueva columna y trigger

- `vehicles.current_responsible_employee_id` ya existe como `responsible_user_id` → **reutilizar**.
- Trigger `on_delivery_closed`: al pasar `vehicle_deliveries.status` a `cerrado`, actualizar `vehicles.responsible_user_id = NEW.supervisor_id` y `vehicles.status = 'asignado'` + insertar `audit_log` con `vehiculo_responsable_actualizado`.
- Trigger `prevent_closed_delivery_modification`: bloquear UPDATE/DELETE en `vehicle_deliveries` cerrada salvo si el actor es root.
- Trigger `prevent_evidence_change_after_close`: bloquear cambios en `vehicle_evidence` cuya entrega esté cerrada, salvo root.

### 2.3 Función helper

```sql
create or replace function public.supervisor_can_see_vehicle(_vehicle_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from vehicle_deliveries
    where vehicle_id = _vehicle_id and supervisor_id = _user_id
  ) or exists(
    select 1 from vehicles where id = _vehicle_id and responsible_user_id = _user_id
  );
$$;
```

---

## 3. Cambios en frontend

### 3.1 Sidebar (`AppSidebar.tsx`)
Restringir items para `supervisor`:
- Visible: Mi dashboard, Mis vehículos, Mis asignaciones, Mis evidencias, Mi perfil.
- Oculto: Ayuntamientos, Empleados, Administración de accesos, Auditoría, Configuración.

### 3.2 Guards de ruta
Añadir `beforeLoad` en rutas administrativas que rechace `role === 'supervisor'` y redirija a `/app` con toast "No tienes permiso para ver este recurso".
Rutas afectadas: `app.access.*`, `app.employees.*`, `app.municipalities.*`, `app.audit.*`, `app.settings.*`, `app.users.*`.

### 3.3 Consultas filtradas para supervisor
- `app.vehicles.index.tsx`: si role=supervisor, filtrar `.or('responsible_user_id.eq.<uid>,id.in.(<vehicle_ids de sus deliveries>)')`.
- `app.deliveries.index.tsx`: si role=supervisor, `.eq('supervisor_id', user.id)`.
- `app.evidence.index.tsx`: si role=supervisor, filtrar por sus vehículos.
- `app.index.tsx` (dashboard): cards adaptadas a role supervisor (solo conteos suyos).

### 3.4 Nuevo flujo "Asignar vehículo" desde detalle del vehículo
En `app.vehicles.$id.tsx`, para coordinador/root añadir botón **"Iniciar asignación"** que abra dialog:
- Selector supervisor (ya implementado, reutilizar query)
- Fecha asignación (default: hoy)
- Observaciones
- Al confirmar: crea `vehicle_deliveries` con `status='evidencias_pendientes'`, `supervisor_id`, `created_by`, audit `asignacion_creada` + `supervisor_asignado`. Redirige al detalle de la nueva entrega.

### 3.5 Detalle de entrega — flujo supervisor
En `app.deliveries.$id.tsx`:
- Si `role==='supervisor'` y es su entrega:
  - Mostrar siempre botón **"Subir evidencias"** (link a `/app/evidence?vehicle=<id>`) si `status in ('evidencias_pendientes','pendiente_firma')`.
  - Mostrar **"Firmar aceptación"** cuando `evidence.length > 0` y `status !== 'firmado'/'cerrado'/'cancelado'`. Al pulsarlo, si `status==='evidencias_pendientes'` cambiar a `pendiente_firma` antes de navegar a `/sign`.
  - Tras firmar, mostrar **"Finalizar asignación"** que pone `status='cerrado'`, `closed_at=now()` (el trigger actualiza `vehicles`).
- Si NO es su entrega y es supervisor → 403 page.

### 3.6 Pantalla de firma (`app.deliveries.$id.sign.tsx`)
Verificar que ya incluye:
- Canvas para firmar con dedo/ratón ✓ (asumido — revisar)
- Botón limpiar
- **Checkbox obligatorio** "Acepto la entrega del vehículo en el estado registrado." (añadir si falta)
- **Texto declarativo** completo (añadir si falta)
- Submit deshabilitado hasta firma + checkbox
- Tras guardar firma: status → `firmado`, audit `firma_registrada`+`asignacion_firmada`.

### 3.7 Subida de evidencias para supervisor
`app.evidence.index.tsx`: si supervisor, mostrar solo sus vehículos y solo permitir uploader en vehículos suyos. Cada upload registra audit `evidencia_subida` con `delivery_id` asociado.

---

## 4. Auditoría — eventos a garantizar
Añadir/verificar `logAudit` en cada acción:
`asignacion_creada`, `supervisor_asignado`, `supervisor_cambiado`, `evidencia_subida`, `firma_registrada`, `asignacion_firmada`, `asignacion_cerrada`, `vehiculo_responsable_actualizado` (trigger), `acceso_denegado` (en guards).

---

## 5. Datos demo
Script de seed (vía `supabase--insert`) tras aplicar migraciones:
- 10 vehículos, 10 ayuntamientos, ~40 perfiles, 5 supervisores activos, 5 coordinadores.
- 5 entregas en estados: `evidencias_pendientes`, `pendiente_firma` (con evidencias), `firmado`, `cerrado`, una con `supervisor_id` cambiado (audit refleja el cambio).
- Usuarios auth: `root@demo.local`, `gerencia@demo.local`, `coordinador@demo.local`, `supervisor@demo.local` (password único compartido para demo).

---

## 6. Archivos a tocar

**SQL (1 migración aditiva):**
- `supabase/migrations/<ts>_supervisor_rls_and_delivery_close.sql`

**Frontend:**
- `src/components/AppSidebar.tsx` — filtrar items por role supervisor
- `src/routes/app.vehicles.index.tsx` — filtro supervisor
- `src/routes/app.vehicles.$id.tsx` — botón "Iniciar asignación" + dialog
- `src/routes/app.deliveries.index.tsx` — filtro supervisor
- `src/routes/app.deliveries.$id.tsx` — botones supervisor + finalizar
- `src/routes/app.deliveries.$id.sign.tsx` — checkbox + texto declarativo (verificar)
- `src/routes/app.evidence.index.tsx` — filtro supervisor + audit con delivery_id
- `src/routes/app.index.tsx` — dashboard supervisor
- `src/routes/app.access.index.tsx`, `app.employees.index.tsx`, `app.municipalities.index.tsx`, `app.audit.index.tsx`, `app.settings.index.tsx`, `app.users.index.tsx` — guard role
- `src/lib/auth-context.tsx` — sin cambios (rol ya disponible)

**No se tocará:** `client.ts`, `types.ts`, `config.toml` (project_id), edge functions existentes.

---

## 7. Checklist de pruebas (post-implementación)

1. **Coordinador asigna**: login coordinador → vehículo → "Iniciar asignación" → selecciona supervisor → entrega creada en `evidencias_pendientes`.
2. **Supervisor aislado**: login supervisor → sidebar muestra solo 5 items → `/app/employees` redirige con 403 → `/app/vehicles/<otro_id>` 403.
3. **Supervisor sube + firma + cierra**: abre su asignación → sube 2 fotos → "Firmar aceptación" → checkbox + canvas → guarda → "Finalizar asignación" → status `cerrado` → vehículo `responsible_user_id` = él, status `asignado`.
4. **Bloqueo post-cierre**: coordinador intenta editar entrega cerrada → bloqueado por trigger. Root sí puede.
5. **Auditoría**: `audit_log` contiene los 8 eventos del flujo.
6. **Coordinador cambia supervisor** antes de firma → permitido + audit `supervisor_cambiado`.
7. **RLS directo**: con sesión supervisor, `supabase.from('vehicle_deliveries').select('*')` retorna solo las suyas (no filtro frontend).

---

## 8. Riesgos y notas

- **Cambio RLS en `vehicles`/`deliveries`** puede romper queries existentes que asumen acceso global. Mitigado: roles admin mantienen acceso vía `has_role()`.
- **Trigger de cierre**: si una entrega ya cerrada se reabre y vuelve a cerrar, reasigna responsable. Aceptable.
- **Datos demo**: requieren crear usuarios auth — se hará con `supabaseAdmin` en seed; passwords visibles en logs de migración (acepta riesgo demo).
- **Pendiente fuera de scope**: rediseño visual, reportes PDF, notificaciones email — no se tocan.

---

## ¿Apruebas?

Si confirmas, ejecuto en este orden:
1. Migración SQL (RLS + triggers + función helper).
2. Edits frontend (sidebar, guards, filtros, flujo asignación, finalizar).
3. Seed de datos demo.
4. Verificación manual con checklist.
