
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid,
  ADD COLUMN IF NOT EXISTS disabled_reason text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.prevent_last_root_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  root_count integer;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'root') OR
     (TG_OP = 'UPDATE' AND OLD.role = 'root' AND NEW.role <> 'root') THEN
    SELECT count(*) INTO root_count
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'root' AND p.active = true AND ur.user_id <> OLD.user_id;
    IF root_count = 0 THEN
      RAISE EXCEPTION 'No se puede desactivar el último usuario root activo.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_root_removal ON public.user_roles;
CREATE TRIGGER trg_prevent_last_root_removal
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_root_removal();

CREATE OR REPLACE FUNCTION public.prevent_last_root_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  root_count integer;
BEGIN
  IF OLD.active = true AND NEW.active = false THEN
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = OLD.id AND role = 'root') THEN
      SELECT count(*) INTO root_count
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.role = 'root' AND p.active = true AND p.id <> OLD.id;
      IF root_count = 0 THEN
        RAISE EXCEPTION 'No se puede desactivar el último usuario root activo.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_root_deactivation ON public.profiles;
CREATE TRIGGER trg_prevent_last_root_deactivation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_root_deactivation();
