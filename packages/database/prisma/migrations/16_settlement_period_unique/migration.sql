-- Défense en profondeur contre le double reversement (montée en charge multi-instance).
--
-- Le batchNumber est aléatoire : sans garde, deux exécutions concurrentes du cron
-- de settlement (une par pod) créaient deux batches pour la MÊME période → double
-- reversement au marchand. Le verrou applicatif CronLockService est la 1re ligne
-- de défense ; cet index unique PARTIEL garantit l'invariant au niveau base même
-- si deux instances passaient le verrou.
--
-- Partiel (WHERE status <> 'FAILED') : un batch FAILED n'occupe pas la période,
-- ce qui autorise un re-run légitime après échec.
CREATE UNIQUE INDEX IF NOT EXISTS "settlement_batches_active_period_uq"
  ON "settlement_batches" ("merchant_id", "period_start", "period_end")
  WHERE status <> 'FAILED';
