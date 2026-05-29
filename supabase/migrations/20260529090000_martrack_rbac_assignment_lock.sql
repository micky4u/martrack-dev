-- MarTrack RBAC + asignación firmada/bloqueada
-- Objetivo:
-- 1) incorporar rol empleado,
-- 2) permitir asignación coordinada vehículo -> supervisor -> empleado/equipo,
-- 3) cambiar firma móvil a estado Dado por Asignado,
-- 4) bloquear modificaciones posteriores sin autorización.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'empleado'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'empleado';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'delivery_status' AND e.enumlabel = 'dado_por_asignado'
  ) THEN
    ALTER TYPE public.delivery_status ADD VALUE 'dado_por_asignado';
  END IF;
END $$;

ALTER TABLE public.vehicle_deliveries
  ADD COLUMN IF NOT EXISTS assigned_employee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignment_locked boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_vehicle_deliveries_assigned_employee_id
  ON public.vehicle_deliveries(assigned_employee_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_deliveries_supervisor_status
  ON public.vehicle_deliveries(supervisor_id, status);

-- Reglas de lectura: empleados solo ven lo suyo; supervisor lo asignado; coordinación/root lo operativo.
DROP POLICY IF EXISTS del_select ON public.vehicle_deliveries;
CREATE POLICY del_select ON public.vehicle_deliveries FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'root')
  OR public.has_role(auth.uid(),'coordinador')
  OR supervisor_id = auth.uid()
  OR assigned_employee_id = auth.uid()
);

-- Crear asignaciones: root/coordinador.
DROP POLICY IF EXISTS del_insert ON public.vehicle_deliveries;
CREATE POLICY del_insert ON public.vehicle_deliveries FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'root') OR public.has_role(auth.uid(),'coordinador')
);

-- Actualizar asignaciones: root/coordinador; supervisor solo para firmar su propia asignación.
DROP POLICY IF EXISTS del_update ON public.vehicle_deliveries;
CREATE POLICY del_update ON public.vehicle_deliveries FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'root')
  OR public.has_role(auth.uid(),'coordinador')
  OR supervisor_id = auth.uid()
) WITH CHECK (
  public.has_role(auth.uid(),'root')
  OR public.has_role(auth.uid(),'coordinador')
  OR supervisor_id = auth.uid()
);

-- Profiles: solo Root/Coordinador editan perfiles ajenos. Se mantiene edición propia si existe la política previa.
DROP POLICY IF EXISTS profiles_coord_update ON public.profiles;
CREATE POLICY profiles_coord_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'coordinador'))
  WITH CHECK (public.has_role(auth.uid(), 'coordinador'));

-- Roles: Root/Coordinador pueden leer roles para administración. La escritura directa sigue protegida por root;
-- Coordinador cambia roles mediante Edge Function con reglas anti-escalada.
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(),'root')
  OR public.has_role(auth.uid(),'coordinador')
);

-- El supervisor puede insertar firma solo si es el supervisor asignado y aún está pendiente.
DROP POLICY IF EXISTS sig_insert ON public.delivery_signatures;
CREATE POLICY sig_insert ON public.delivery_signatures FOR INSERT TO authenticated WITH CHECK (
  signed_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.vehicle_deliveries d
    WHERE d.id = delivery_id
      AND d.supervisor_id = auth.uid()
      AND d.status::text IN ('pendiente_firma', 'firmado')
      AND d.assignment_locked = false
  )
);

-- Ver firmas: root/coordinador/supervisor firmante o asignado.
DROP POLICY IF EXISTS sig_select ON public.delivery_signatures;
CREATE POLICY sig_select ON public.delivery_signatures FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'root')
  OR public.has_role(auth.uid(),'coordinador')
  OR signed_by = auth.uid()
  OR EXISTS(SELECT 1 FROM public.vehicle_deliveries d WHERE d.id = delivery_id AND d.supervisor_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.on_assignment_confirmed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::text IN ('dado_por_asignado', 'cerrado')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.supervisor_id IS NOT NULL THEN
    UPDATE public.vehicles
       SET responsible_user_id = NEW.supervisor_id,
           status = CASE WHEN status = 'disponible' THEN 'asignado'::vehicle_status ELSE status END,
           updated_at = now()
     WHERE id = NEW.vehicle_id;

    INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, description, metadata)
    VALUES (
      auth.uid(),
      'vehicle',
      NEW.vehicle_id,
      'vehiculo_dado_por_asignado',
      'Vehículo activado por firma de asignación ' || NEW.id::text,
      jsonb_build_object('delivery_id', NEW.id, 'supervisor_id', NEW.supervisor_id, 'assigned_employee_id', NEW.assigned_employee_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_delivery_closed ON public.vehicle_deliveries;
DROP TRIGGER IF EXISTS trg_on_assignment_confirmed ON public.vehicle_deliveries;
CREATE TRIGGER trg_on_assignment_confirmed
AFTER UPDATE OF status ON public.vehicle_deliveries
FOR EACH ROW EXECUTE FUNCTION public.on_assignment_confirmed();

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_assignment_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor_is_root boolean := public.has_role(auth.uid(), 'root');
  actor_is_coord boolean := public.has_role(auth.uid(), 'coordinador');
  actor_is_supervisor boolean := OLD.supervisor_id = auth.uid();
BEGIN
  IF actor_is_root THEN
    RETURN NEW;
  END IF;

  IF OLD.assignment_locked = true OR OLD.status::text IN ('dado_por_asignado', 'cerrado') THEN
    RAISE EXCEPTION 'Esta asignación está bloqueada. Solo Root puede modificarla o reabrirla.';
  END IF;

  IF actor_is_coord THEN
    IF NEW.status::text IN ('dado_por_asignado', 'cerrado') THEN
      RAISE EXCEPTION 'La confirmación de asignación solo puede realizarla el supervisor mediante firma.';
    END IF;
    RETURN NEW;
  END IF;

  IF actor_is_supervisor THEN
    IF OLD.status::text IN ('pendiente_firma', 'firmado')
       AND NEW.status::text = 'dado_por_asignado'
       AND NEW.assignment_locked = true
       AND NEW.signed_at IS NOT NULL
       AND NEW.vehicle_id IS NOT DISTINCT FROM OLD.vehicle_id
       AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
       AND NEW.supervisor_id IS NOT DISTINCT FROM OLD.supervisor_id
       AND NEW.assigned_employee_id IS NOT DISTINCT FROM OLD.assigned_employee_id
       AND NEW.notes IS NOT DISTINCT FROM OLD.notes
       AND NEW.cancel_reason IS NOT DISTINCT FROM OLD.cancel_reason
       AND NEW.closed_at IS NOT DISTINCT FROM OLD.closed_at THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Supervisor solo puede confirmar mediante firma su asignación pendiente.';
  END IF;

  RAISE EXCEPTION 'Sin permisos para modificar asignación.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_closed_delivery ON public.vehicle_deliveries;
DROP TRIGGER IF EXISTS trg_prevent_unauthorized_assignment_update ON public.vehicle_deliveries;
CREATE TRIGGER trg_prevent_unauthorized_assignment_update
BEFORE UPDATE ON public.vehicle_deliveries
FOR EACH ROW EXECUTE FUNCTION public.prevent_unauthorized_assignment_update();
