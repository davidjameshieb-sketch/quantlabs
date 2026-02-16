-- Add unique constraint on (memory_type, memory_key) for sovereign_memory upserts
ALTER TABLE public.sovereign_memory
ADD CONSTRAINT sovereign_memory_type_key_unique UNIQUE (memory_type, memory_key);