
-- Drop the overly-broad restrictive SELECT policies that let any authenticated user query all rows
DROP POLICY IF EXISTS "Deny unauthenticated profile access" ON public.profiles;
DROP POLICY IF EXISTS "Deny unauthenticated stripe access" ON public.stripe_customers;
