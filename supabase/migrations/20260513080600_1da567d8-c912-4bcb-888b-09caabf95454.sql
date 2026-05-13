
-- Helper: ¿este vehículo pertenece al supervisor (por entrega o como responsable)?
CREATE OR REPLACE FUNCTION public.supervisor_can_see_vehicle(_vehicle_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.vehicle_deliveries
    WHERE vehicle_id = _vehicle_id AND supervisor_id = _user_id
  ) OR EXISTS(
    SELECT 1 FROM public.vehicles
    WHERE id = _vehicle_id AND responsible_user_id = _user_id
  );
$$;

-- ===== VEHICLES =====
DROP POLICY IF EXISTS veh_select ON public.vehicles;
CREATE POLICY veh_select ON public.vehicles FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'root') OR has_role(auth.uid(),'gerencia') OR has_role(auth.uid(),'coordinador')
  OR (has_role(auth.uid(),'supervisor') AND public.supervisor_can_see_vehicle(id, auth.uid()))
);

-- ===== VEHICLE_DELIVERIES =====
DROP POLICY IF EXISTS del_select ON public.vehicle_deliveries;
CREATE POLICY del_select ON public.vehicle_deliveries FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'root') OR has_role(auth.uid(),'gerencia') OR has_role(auth.uid(),'coordinador')
  OR supervisor_id = auth.uid()
);

-- ===== VEHICLE_EVIDENCE =====
DROP POLICY IF EXISTS ev_select ON public.vehicle_evidence;
CREATE POLICY ev_select ON public.vehicle_evidence FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'root') OR has_role(auth.uid(),'gerencia') OR has_role(auth.uid(),'coordinador')
  OR (has_role(auth.uid(),'supervisor') AND public.supervisor_can_see_vehicle(vehicle_id, auth.uid()))
);

-- Permitir al supervisor subir evidencia SOLO en sus vehículos
DROP POLICY IF EXISTS ev_insert ON public.vehicle_evidence;
CREATE POLICY ev_insert ON public.vehicle_evidence FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(),'root') OR has_role(auth.uid(),'coordinador')
  OR (has_role(auth.uid(),'supervisor') AND public.supervisor_can_see_vehicle(vehicle_id, auth.uid()) AND uploaded_by = auth.uid())
);

-- ===== DELIVERY_SIGNATURES =====
DROP POLICY IF EXISTS sig_select ON public.delivery_signatures;
CREATE POLICY sig_select ON public.delivery_signatures FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'root') OR has_role(auth.uid(),'gerencia') OR has_role(auth.uid(),'coordinador')
  OR signed_by = auth.uid()
  OR EXISTS(SELECT 1 FROM public.vehicle_deliveries d WHERE d.id = delivery_id AND d.supervisor_id = auth.uid())
);

-- ===== AUDIT_LOG: quitar supervisor =====
DROP POLICY IF EXISTS aud_select ON public.audit_log;
CREATE POLICY aud_select ON public.audit_log FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'root') OR has_role(auth.uid(),'gerencia') OR has_role(auth.uid(),'coordinador')
);

-- ===== Trigger: cierre de entrega -> actualizar vehículo =====
CREATE OR REPLACE FUNCTION public.on_delivery_closed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cerrado' AND (OLD.status IS DISTINCT FROM 'cerrado') AND NEW.supervisor_id IS NOT NULL THEN
    UPDATE public.vehicles
       SET responsible_user_id = NEW.supervisor_id,
           status = CASE WHEN status = 'disponible' THEN 'asignado'::vehicle_status ELSE status END,
           updated_at = now()
     WHERE id = NEW.vehicle_id;
    INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, description, metadata)
    VALUES (auth.uid(), 'vehicle', NEW.vehicle_id, 'vehiculo_responsable_actualizado',
            'Responsable actualizado por cierre de entrega ' || NEW.id::text,
            jsonb_build_object('delivery_id', NEW.id, 'supervisor_id', NEW.supervisor_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_delivery_closed ON public.vehicle_deliveries;
CREATE TRIGGER trg_on_delivery_closed
AFTER UPDATE OF status ON public.vehicle_deliveries
FOR EACH ROW EXECUTE FUNCTION public.on_delivery_closed();

-- ===== Trigger: bloquear modificación post-cierre (salvo root) =====
CREATE OR REPLACE FUNCTION public.prevent_closed_delivery_modification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'cerrado' AND NOT public.has_role(auth.uid(), 'root') THEN
    RAISE EXCEPTION 'Esta entrega está cerrada. Solo root puede modificarla.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_closed_delivery ON public.vehicle_deliveries;
CREATE TRIGGER trg_prevent_closed_delivery
BEFORE UPDATE ON public.vehicle_deliveries
FOR EACH ROW EXECUTE FUNCTION public.prevent_closed_delivery_modification();

-- ===== Trigger: bloquear cambios en evidencia de entrega cerrada (salvo root) =====
CREATE OR REPLACE FUNCTION public.prevent_evidence_change_after_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'root') THEN RETURN COALESCE(NEW, OLD); END IF;
  IF EXISTS(
    SELECT 1 FROM public.vehicle_deliveries d
    WHERE d.vehicle_id = COALESCE(NEW.vehicle_id, OLD.vehicle_id)
      AND d.status = 'cerrado'
  ) THEN
    RAISE EXCEPTION 'No se puede modificar evidencia: el vehículo tiene una entrega cerrada.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_prevent_ev_after_close ON public.vehicle_evidence;
CREATE TRIGGER trg_prevent_ev_after_close
BEFORE UPDATE OR DELETE ON public.vehicle_evidence
FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_change_after_close();
