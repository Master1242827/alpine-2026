-- SECURITY: The Melhor Envio token previously committed in this migration
-- has been redacted. The leaked token MUST be rotated in the Melhor Envio
-- dashboard (treat any previously-committed value as fully compromised) and
-- re-entered through Admin → Frete in the app, which writes to
-- public.admin_integrations.melhor_envio_token at runtime.
--
-- No-op preserved to keep migration history intact.
SELECT 1;
