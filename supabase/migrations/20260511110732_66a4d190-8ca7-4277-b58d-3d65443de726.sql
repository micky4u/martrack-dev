-- 1. Profiles: restrict SELECT to self / staff roles
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.has_role(auth.uid(), 'root'::app_role)
    OR public.has_role(auth.uid(), 'coordinador'::app_role)
    OR public.has_role(auth.uid(), 'gerencia'::app_role)
  );

-- 2. Audit log: SELECT only for root/coordinador
DROP POLICY IF EXISTS aud_select ON public.audit_log;
CREATE POLICY aud_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'root'::app_role)
    OR public.has_role(auth.uid(), 'coordinador'::app_role)
  );

-- 3. Audit log: enforce user_id = auth.uid() on INSERT
DROP POLICY IF EXISTS aud_insert ON public.audit_log;
CREATE POLICY aud_insert ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 4. Signatures bucket: make private
UPDATE storage.buckets SET public = false WHERE id = 'signatures';

-- 5. Storage policies: replace permissive ones with role/path-aware rules
DROP POLICY IF EXISTS storage_read_all ON storage.objects;
DROP POLICY IF EXISTS storage_insert_auth ON storage.objects;
DROP POLICY IF EXISTS storage_update_auth ON storage.objects;
DROP POLICY IF EXISTS storage_delete_auth ON storage.objects;

-- Public read of vehicle media remains (it is operational reference, not sensitive)
CREATE POLICY storage_read_vehicle_media ON storage.objects
  FOR SELECT TO public
  USING (bucket_id IN ('vehicle-photos', 'vehicle-documents'));

-- Signatures: only authenticated staff or the supervisor of the related delivery
CREATE POLICY storage_read_signatures ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'signatures'
    AND (
      public.has_role(auth.uid(), 'root'::app_role)
      OR public.has_role(auth.uid(), 'coordinador'::app_role)
      OR public.has_role(auth.uid(), 'gerencia'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.delivery_signatures ds
        JOIN public.vehicle_deliveries d ON d.id = ds.delivery_id
        WHERE ds.storage_path = storage.objects.name
          AND d.supervisor_id = auth.uid()
      )
    )
  );

-- Inserts: only operational roles can upload to these buckets
CREATE POLICY storage_insert_staff ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('vehicle-photos', 'vehicle-documents', 'signatures')
    AND (
      public.has_role(auth.uid(), 'root'::app_role)
      OR public.has_role(auth.uid(), 'coordinador'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  );

-- Updates and deletes restricted to root (overwrite/destruction is rare and audited via app)
CREATE POLICY storage_update_root ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('vehicle-photos', 'vehicle-documents', 'signatures')
    AND public.has_role(auth.uid(), 'root'::app_role)
  );

CREATE POLICY storage_delete_root ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('vehicle-photos', 'vehicle-documents', 'signatures')
    AND public.has_role(auth.uid(), 'root'::app_role)
  );