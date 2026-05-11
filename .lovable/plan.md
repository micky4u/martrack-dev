
# Diagnóstico — MarTrack PMV

He inspeccionado base de datos, RLS y código antes de tocar nada. Los datos confirman las dos causas raíz que reportas, más varias inconsistencias menores.

## 1. Supervisores no aparecen en el selector — CAUSA RAÍZ

**Datos reales en BD:** existen 2 supervisores activos (`supervisor@demo.com`, `j.gomez@demo.com`).

**El bug está en la query**, no en RLS ni en los datos. En `src/routes/app.deliveries.$id.tsx`:

```ts
supabase.from("user_roles")
  .select("user_id, profiles!inner(id,email,full_name,active)")
  .eq("role","supervisor")
```

PostgREST necesita una **foreign key declarada** entre `user_roles.user_id` y `profiles.id` para resolver el embed `profiles!inner(...)`. Tu esquema actual confirma: *"No foreign keys for the table user_roles"*. Por eso el selector llega vacío aunque haya supervisores.

Hay dos arreglos posibles:
- **A (recomendado, no destructivo):** dejar la BD como está y reescribir la query en el cliente como dos lecturas (`user_roles` por rol → `profiles` por `in(user_id)`). Cero migración.
- **B:** añadir la FK `user_roles.user_id → profiles.id`. Es seguro porque hoy todos los `user_id` existen en `profiles`, pero requiere migración. Te lo dejo opcional.

Voy con **A** salvo que prefieras B.

## 2. Evidencias “eliminadas” reaparecen — CAUSA RAÍZ

El borrado en `vehicle.$id.tsx` ya hace soft delete (`active=false`), pero **`src/routes/app.evidence.index.tsx` NO filtra `active`**, así que la galería global vuelve a mostrarlas. También faltan campos de trazabilidad (`deleted_at`, `deleted_by`, `deleted_reason`).

## 3. Otras inconsistencias detectadas

- `app.deliveries.$id.tsx` permite asignar supervisor solo si `evCount > 0` (correcto), pero deja la entrega indefinidamente en `evidencias_pendientes` aunque ya haya evidencias — falta empujar a `pendiente_firma` al asignar supervisor.
- 10 entregas en BD, **ninguna con supervisor asignado**: confirma el bug #1, no datos corruptos.
- `vehicle_evidence` tiene 1 fila con `active=false` que sigue visible en la galería global.
- No hay tabla "muerta" obvia: las 8 tablas se usan. La tabla `audit_log` sí se llena pero faltan eventos canónicos (`supervisor_cambiado` ya existe; `evidencia_eliminada` no se registra como tal — se loguea como `evidencia_desactivada`).
- Botones revisados: no hay botones decorativos en los módulos principales. El selector vacío de supervisor es el síntoma que parecía “botón muerto”.

## Plan de cambios — sin migración destructiva

### A. Frontend (sin tocar BD)

1. **`app.deliveries.$id.tsx`**
   - Reemplazar query embed por dos lecturas: `user_roles where role='supervisor'` → `profiles where id in (...) and active=true`.
   - Mostrar `nombre · cargo · ayuntamiento · email` en cada `SelectItem`.
   - Estado vacío: *"No hay supervisores activos. Crea o activa un empleado con perfil supervisor."* + link a `/app/employees/new` si `root|coordinador`.
   - Al asignar supervisor, si la entrega está en `evidencias_pendientes` y hay evidencias, pasar a `pendiente_firma` (ya existe parcialmente, lo reforzamos).
   - Auditar `supervisor_asignado` / `supervisor_cambiado` (ya existe, queda igual).

2. **`app.evidence.index.tsx`**
   - Añadir `.eq("active", true)` a la query.
   - Estado vacío correcto.

3. **`app.vehicles.$id.tsx`**
   - Renombrar acción de auditoría a `evidencia_eliminada` cuando se desactiva (ya guarda `before/after`, solo cambia el nombre del evento).
   - Botón “Restaurar” visible para `root` sobre evidencias con `active=false` (el archivo sigue en storage; hard delete queda como acción aparte).
   - Añadir acción **“Eliminar definitivamente”** visible solo para `root`: borra fila + objeto en Storage + audita `evidencia_purgada`.

4. **Mensajes vacíos** consistentes en evidencias, supervisores y errores de Storage.

### B. Migración OPCIONAL (solo si la apruebas)

Una sola migración aditiva, **no destructiva** — no borra datos, no elimina tablas, no cambia tipos:

```sql
ALTER TABLE public.vehicle_evidence
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_reason text;

-- Backfill suave: las que ya están active=false reciben deleted_at=updated_at-equivalente
UPDATE public.vehicle_evidence
   SET deleted_at = now()
 WHERE active = false AND deleted_at IS NULL;
```

Sin esto, el sistema sigue funcionando con `active=false` como soft delete (la opción A ya lo hace consistente). Te dejo elegir.

### C. Lo que NO voy a hacer en este turno

- No añado FK `user_roles → profiles` (innecesario para arreglar el bug).
- No creo seeds masivos de empleados (40 empleados, etc.) sin tu OK — sí puedo hacerlo en un paso posterior con `supabase--insert` y datos sintéticos, pero quería confirmar contigo primero porque mencionaste *"no datos reales"* y porque inflar la BD con 40 perfiles sin auth real puede dar problemas en el flujo (necesitan fila en `auth.users` para poder loguearse).
- No elimino tablas ni columnas: ninguna está muerta.

## Orden de aplicación

1. Cambios de frontend (puntos A.1–A.4) — sin riesgo.
2. Verificación: probar selector de supervisor en `/app/deliveries/<id>`, eliminar evidencia y confirmar que no reaparece.
3. (Opcional) Migración aditiva del punto B si la confirmas.
4. (Opcional) Seed sintético de 3–5 supervisores adicionales y 2–3 entregas en distintos estados, una vez decidamos cómo gestionar los `auth.users` (vía edge function `create-employee` ya existente).

## ¿Cómo seguimos?

Confirma una de estas:

- **“Aplica A”** → ejecuto solo cambios de frontend.
- **“Aplica A + B”** → cambios de frontend + migración aditiva de campos de borrado.
- **“Aplica A + B + seeds”** → todo lo anterior + 5 supervisores demo y entregas en varios estados (creados vía la edge function existente, password `demo1234`).

No tocaré nada más hasta tu confirmación.
