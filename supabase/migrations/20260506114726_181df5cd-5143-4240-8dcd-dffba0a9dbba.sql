
-- Insert demo users directly into auth.users
DO $$
DECLARE
  emails TEXT[] := ARRAY['root@demo.com','gerencia@demo.com','coordinador@demo.com','supervisor@demo.com'];
  e TEXT;
  uid UUID;
  enc_pw TEXT := crypt('demo1234', gen_salt('bf'));
BEGIN
  FOREACH e IN ARRAY emails LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = e) THEN
      uid := gen_random_uuid();
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, confirmation_token,
        recovery_token, email_change_token_new, email_change
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated','authenticated', e, enc_pw,
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', initcap(split_part(e,'@',1))),
        '', '', '', ''
      );
      INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', e), 'email', now(), now(), now());
    END IF;
  END LOOP;
END $$;
