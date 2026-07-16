DO $$
DECLARE
  target_table text;
  has_rows boolean;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'performance_import_rows',
    'performance_import_batches',
    'hypothesis_variants',
    'variant_comparisons',
    'creative_hypotheses',
    'client_performance_learnings',
    'creative_performance_snapshots'
  ]
  LOOP
    IF to_regclass(format('%I.%I', 'adscale_app', target_table)) IS NOT NULL THEN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I.%I LIMIT 1)',
        'adscale_app',
        target_table
      ) INTO has_rows;

      IF has_rows THEN
        RAISE EXCEPTION
          'Refusing to retire non-empty table adscale_app.%', target_table
          USING
            ERRCODE = '55000',
            HINT = 'Export and explicitly clear the retired performance data before retrying migration 0074.';
      END IF;
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS "adscale_app"."performance_import_rows";
DROP TABLE IF EXISTS "adscale_app"."performance_import_batches";
DROP TABLE IF EXISTS "adscale_app"."hypothesis_variants";
DROP TABLE IF EXISTS "adscale_app"."variant_comparisons";
DROP TABLE IF EXISTS "adscale_app"."creative_hypotheses";
DROP TABLE IF EXISTS "adscale_app"."client_performance_learnings";
DROP TABLE IF EXISTS "adscale_app"."creative_performance_snapshots";
