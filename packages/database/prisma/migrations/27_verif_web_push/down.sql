-- Migration inverse de 27_verif_web_push (manuelle : psql -f down.sql).
DROP TABLE "web_push_subscriptions";
