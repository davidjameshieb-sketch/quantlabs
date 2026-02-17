
-- Delete all old trade data EXCEPT the 4 currently active live filled trades
DELETE FROM public.oanda_orders
WHERE id NOT IN (
  'cccc8d5d-7eee-4802-b2f8-c828ce5783fe',
  '66c97602-2133-42d1-a649-d5c4d34ed9cf',
  'e523ea90-5f3c-41e6-b95e-a603644f4812',
  '34202c70-6c10-41db-bf53-91ef313bc099'
);
