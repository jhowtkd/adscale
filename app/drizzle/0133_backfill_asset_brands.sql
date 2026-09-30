-- Preserve existing brand ownership. Ambiguous legacy rows remain unbranded
-- and visible to all brands in their workspace; never infer from a name.
WITH evidence AS (
  SELECT a.id AS asset_id, p.id AS profile_id
  FROM "adscale_app"."workspace_assets" a
  JOIN "adscale_app"."client_profiles" p ON p.workspace_id = a.workspace_id
  WHERE p.logo_asset_key = a.key
     OR a.metadata->>'clientProfileId' = p.id::text
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(coalesce(p.brand_font_assets, '[]'::jsonb)) font
       WHERE font->>'assetKey' = a.key
     )
  UNION ALL
  SELECT a.id, p.id
  FROM "adscale_app"."workspace_assets" a
  JOIN "adscale_app"."client_references" r ON r.workspace_id = a.workspace_id AND r.asset_key = a.key
  JOIN "adscale_app"."client_profiles" p ON p.id = r.client_profile_id AND p.workspace_id = a.workspace_id
  UNION ALL
  SELECT a.id, p.id
  FROM "adscale_app"."workspace_assets" a
  JOIN "adscale_app"."creative_work_outputs" o ON o.workspace_id = a.workspace_id AND o.output_key = a.key
  JOIN "adscale_app"."creative_work_items" w ON w.id = o.work_item_id AND w.workspace_id = a.workspace_id
  JOIN "adscale_app"."client_profiles" p ON p.id = w.client_profile_id AND p.workspace_id = a.workspace_id
), unique_evidence AS (
  SELECT asset_id, min(profile_id::text)::uuid AS profile_id
  FROM evidence GROUP BY asset_id HAVING count(DISTINCT profile_id) = 1
), single_brand AS (
  SELECT workspace_id, min(id::text)::uuid AS profile_id
  FROM "adscale_app"."client_profiles" GROUP BY workspace_id HAVING count(*) = 1
), assignments AS (
  SELECT a.id, coalesce(e.profile_id, s.profile_id) AS profile_id
  FROM "adscale_app"."workspace_assets" a
  LEFT JOIN unique_evidence e ON e.asset_id = a.id
  LEFT JOIN single_brand s ON s.workspace_id = a.workspace_id
    AND NOT EXISTS (SELECT 1 FROM evidence WHERE asset_id = a.id)
  WHERE a.client_profile_id IS NULL
    AND a.source <> 'curated_inspiration'
    AND coalesce(a.metadata->>'provisional', 'false') <> 'true'
)
UPDATE "adscale_app"."workspace_assets" a SET client_profile_id = assignments.profile_id
FROM assignments WHERE assignments.id = a.id AND assignments.profile_id IS NOT NULL;
