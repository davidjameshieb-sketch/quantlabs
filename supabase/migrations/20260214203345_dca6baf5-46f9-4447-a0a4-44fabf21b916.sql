-- Create a helper function that allows the service role to execute arbitrary SQL
-- This is the Sovereign Intelligence's DDL authority
CREATE OR REPLACE FUNCTION public.exec_sql(sql_text text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result json;
BEGIN
  EXECUTE sql_text;
  RETURN json_build_object('success', true, 'executed', left(sql_text, 200));
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM, 'sql', left(sql_text, 200));
END;
$$;

-- Only service role can call this
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM authenticated;