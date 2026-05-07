
-- Empleados: ampliar profiles con campos operativos
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS municipality_id uuid REFERENCES public.municipalities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS driving_license text,
  ADD COLUMN IF NOT EXISTS observations text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Permitir a coordinador editar empleados (datos operativos) y root ya tiene ALL
DROP POLICY IF EXISTS profiles_coord_update ON public.profiles;
CREATE POLICY profiles_coord_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'coordinador'));

-- Evidencias: añadir flags válida/activa y permitir UPDATE
ALTER TABLE public.vehicle_evidence
  ADD COLUMN IF NOT EXISTS is_valid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS ev_update ON public.vehicle_evidence;
CREATE POLICY ev_update ON public.vehicle_evidence
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'root')
    OR public.has_role(auth.uid(), 'coordinador')
    OR uploaded_by = auth.uid()
  );

-- Entregas: permitir motivo de cancelación
ALTER TABLE public.vehicle_deliveries
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- Permitir a coordinador gestionar ayuntamientos (no solo root)
DROP POLICY IF EXISTS mun_coord_write ON public.municipalities;
CREATE POLICY mun_coord_write ON public.municipalities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coordinador'))
  WITH CHECK (public.has_role(auth.uid(), 'coordinador'));

-- Añadir estado de entrega "cancelado"
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                 WHERE t.typname='delivery_status' AND e.enumlabel='cancelado') THEN
    ALTER TYPE public.delivery_status ADD VALUE 'cancelado';
  END IF;
END $$;

-- Trigger updated_at en profiles
DROP TRIGGER IF EXISTS profiles_touch ON public.profiles;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
