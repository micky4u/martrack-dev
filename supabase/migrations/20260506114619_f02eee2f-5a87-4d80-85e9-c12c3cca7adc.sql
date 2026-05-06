
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('root','gerencia','coordinador','supervisor');
CREATE TYPE public.vehicle_status AS ENUM ('disponible','asignado','en_revision','baja');
CREATE TYPE public.fuel_type AS ENUM ('gasolina','diesel','hibrido','electrico','glp');
CREATE TYPE public.delivery_status AS ENUM ('borrador','evidencias_pendientes','pendiente_supervisor','pendiente_firma','firmado','cerrado');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- USER_ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- has_role function (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.user_roles WHERE user_id=_user_id ORDER BY 
  CASE role WHEN 'root' THEN 1 WHEN 'gerencia' THEN 2 WHEN 'coordinador' THEN 3 WHEN 'supervisor' THEN 4 END
  LIMIT 1 $$;

-- Trigger: create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
  -- Auto-assign role based on email prefix for demo
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.email LIKE 'root@%' THEN 'root'::app_role
      WHEN NEW.email LIKE 'gerencia@%' THEN 'gerencia'::app_role
      WHEN NEW.email LIKE 'coordinador@%' THEN 'coordinador'::app_role
      WHEN NEW.email LIKE 'supervisor@%' THEN 'supervisor'::app_role
      ELSE 'supervisor'::app_role
    END
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- MUNICIPALITIES
CREATE TABLE public.municipalities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  zone TEXT,
  internal_responsible TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VEHICLES
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate TEXT NOT NULL UNIQUE,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT,
  registration_date DATE,
  color TEXT,
  engine_type TEXT,
  fuel fuel_type,
  mileage INT DEFAULT 0,
  status vehicle_status NOT NULL DEFAULT 'disponible',
  municipality_id UUID REFERENCES public.municipalities(id) ON DELETE SET NULL,
  responsible_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER vehicles_touch BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- VEHICLE EVIDENCE
CREATE TABLE public.vehicle_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'photo', -- photo | document
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VEHICLE DELIVERIES
CREATE TABLE public.vehicle_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  supervisor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status delivery_status NOT NULL DEFAULT 'borrador',
  notes TEXT,
  signed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER deliveries_touch BEFORE UPDATE ON public.vehicle_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- DELIVERY SIGNATURES
CREATE TABLE public.delivery_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL UNIQUE REFERENCES public.vehicle_deliveries(id) ON DELETE CASCADE,
  signed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signer_name TEXT,
  storage_path TEXT NOT NULL,
  acceptance_text TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AUDIT LOG
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ENABLE RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- POLICIES
-- profiles: all authenticated read; user updates own; root updates all
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_root_all ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'root')) WITH CHECK (public.has_role(auth.uid(),'root'));

-- user_roles: read self or root; write only root
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'root'));
CREATE POLICY user_roles_root_write ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'root')) WITH CHECK (public.has_role(auth.uid(),'root'));

-- municipalities: all read; root manages
CREATE POLICY mun_select ON public.municipalities FOR SELECT TO authenticated USING (true);
CREATE POLICY mun_root ON public.municipalities FOR ALL TO authenticated USING (public.has_role(auth.uid(),'root')) WITH CHECK (public.has_role(auth.uid(),'root'));

-- vehicles: read all authenticated; coord/root insert/update; root delete
CREATE POLICY veh_select ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY veh_insert ON public.vehicles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'root') OR public.has_role(auth.uid(),'coordinador'));
CREATE POLICY veh_update ON public.vehicles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'root') OR public.has_role(auth.uid(),'coordinador'));
CREATE POLICY veh_delete ON public.vehicles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'root'));

-- evidence: read all auth; insert by coord/root/supervisor
CREATE POLICY ev_select ON public.vehicle_evidence FOR SELECT TO authenticated USING (true);
CREATE POLICY ev_insert ON public.vehicle_evidence FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'root') OR public.has_role(auth.uid(),'coordinador') OR public.has_role(auth.uid(),'supervisor')
);
CREATE POLICY ev_delete ON public.vehicle_evidence FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'root') OR uploaded_by = auth.uid());

-- deliveries: all read; coord/root create/update; supervisor can update their own (sign)
CREATE POLICY del_select ON public.vehicle_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY del_insert ON public.vehicle_deliveries FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'root') OR public.has_role(auth.uid(),'coordinador'));
CREATE POLICY del_update ON public.vehicle_deliveries FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'root') OR public.has_role(auth.uid(),'coordinador') OR supervisor_id = auth.uid()
);
CREATE POLICY del_delete ON public.vehicle_deliveries FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'root'));

-- signatures: all read; insert by signer (the supervisor) or root
CREATE POLICY sig_select ON public.delivery_signatures FOR SELECT TO authenticated USING (true);
CREATE POLICY sig_insert ON public.delivery_signatures FOR INSERT TO authenticated WITH CHECK (
  signed_by = auth.uid() OR public.has_role(auth.uid(),'root')
);

-- audit: read all auth; insert by any auth
CREATE POLICY aud_select ON public.audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY aud_insert ON public.audit_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- STORAGE BUCKETS
INSERT INTO storage.buckets (id, name, public) VALUES
  ('vehicle-photos','vehicle-photos', true),
  ('vehicle-documents','vehicle-documents', true),
  ('signatures','signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (authenticated can upload/read; public read since buckets are public)
CREATE POLICY storage_read_all ON storage.objects FOR SELECT TO public USING (bucket_id IN ('vehicle-photos','vehicle-documents','signatures'));
CREATE POLICY storage_insert_auth ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('vehicle-photos','vehicle-documents','signatures'));
CREATE POLICY storage_update_auth ON storage.objects FOR UPDATE TO authenticated USING (bucket_id IN ('vehicle-photos','vehicle-documents','signatures'));
CREATE POLICY storage_delete_auth ON storage.objects FOR DELETE TO authenticated USING (bucket_id IN ('vehicle-photos','vehicle-documents','signatures'));

-- SEED MUNICIPALITIES
INSERT INTO public.municipalities (name, zone, internal_responsible) VALUES
  ('Palma','Centro','J. Riera'),
  ('Calvià','Sur-Oeste','M. Vicens'),
  ('Marratxí','Centro','A. Fiol'),
  ('Llucmajor','Sur','C. Ramis'),
  ('Inca','Norte','P. Llabrés'),
  ('Manacor','Levante','S. Galmés'),
  ('Sóller','Norte-Oeste','T. Bisbal'),
  ('Alcúdia','Norte','R. Cifre'),
  ('Andratx','Oeste','N. Pujol'),
  ('Santa Margalida','Norte-Este','E. Capó');

-- SEED VEHICLES (one per municipality)
INSERT INTO public.vehicles (plate, brand, model, year, registration_date, color, engine_type, fuel, mileage, status, municipality_id, observations)
SELECT v.plate, v.brand, v.model, v.year, v.registration_date::date, v.color, v.engine_type, v.fuel::fuel_type, v.mileage, v.status::vehicle_status, m.id, v.obs
FROM (VALUES
  ('1234-MTA','Renault','Kangoo',2021,'2021-03-12','Blanco','1.5 dCi','diesel',38400,'disponible','Palma','Vehículo de servicio urbano'),
  ('5678-MTB','Peugeot','Partner',2020,'2020-07-04','Gris','1.6 BlueHDi','diesel',56120,'asignado','Calvià','Asignado a brigada'),
  ('9012-MTC','Citroën','Berlingo',2022,'2022-01-25','Azul','1.5 BlueHDi','diesel',21800,'disponible','Marratxí','Sin observaciones'),
  ('3456-MTD','Dacia','Duster',2019,'2019-09-18','Negro','1.5 dCi','diesel',82900,'en_revision','Llucmajor','Pendiente revisión técnica'),
  ('7890-MTE','Ford','Transit',2021,'2021-11-02','Blanco','2.0 EcoBlue','diesel',47330,'asignado','Inca','Vehículo de carga'),
  ('2345-MTF','Volkswagen','Caddy',2023,'2023-04-15','Plata','1.5 TSI','gasolina',12450,'disponible','Manacor','Nuevo en flota'),
  ('6789-MTG','Toyota','Yaris',2022,'2022-08-09','Rojo','1.5 Hybrid','hibrido',18900,'disponible','Sóller','Híbrido eficiente'),
  ('0123-MTH','Nissan','Leaf',2023,'2023-02-20','Blanco','Eléctrico 40kWh','electrico',9800,'asignado','Alcúdia','100% eléctrico'),
  ('4567-MTI','Seat','Ibiza',2020,'2020-05-30','Azul','1.0 TSI','gasolina',64200,'disponible','Andratx','Coche de gestión'),
  ('8901-MTJ','Renault','Master',2022,'2022-10-12','Blanco','2.3 dCi','diesel',31500,'en_revision','Santa Margalida','Furgón de mantenimiento')
) AS v(plate,brand,model,year,registration_date,color,engine_type,fuel,mileage,status,mun_name,obs)
JOIN public.municipalities m ON m.name = v.mun_name;
