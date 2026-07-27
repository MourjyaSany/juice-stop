-- Extensions required by the Juice Stop schema (02-data-model.md §1).
-- Runs once, on first container init. Production applies the same set via migration 0001.

CREATE EXTENSION IF NOT EXISTS postgis;            -- service-zone polygons, building points
CREATE EXTENSION IF NOT EXISTS pg_trgm;            -- fuzzy product search
CREATE EXTENSION IF NOT EXISTS citext;             -- case-insensitive email / coupon codes
CREATE EXTENSION IF NOT EXISTS pgcrypto;           -- column encryption (TOTP secrets, licence numbers)
CREATE EXTENSION IF NOT EXISTS btree_gin;          -- composite GIN indexes
CREATE EXTENSION IF NOT EXISTS pg_stat_statements; -- slow-query visibility in dev

-- UUIDv7 (ADR-009): time-sortable primary keys.
-- Postgres 18 ships uuidv7() natively; on 16 we provide a compatible implementation so the
-- schema is identical across versions and the migration to 18 is a drop-in.
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$ LANGUAGE sql VOLATILE PARALLEL SAFE;

COMMENT ON FUNCTION uuid_generate_v7() IS
  'UUIDv7 — time-ordered UUID. See ADR-009: sequential insert locality without leaking order volume.';
