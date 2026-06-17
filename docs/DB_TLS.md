# Connexion PostgreSQL chiffrée (TLS verify-full) — ALP-165 / PAY-VULN-014

En staging/prod, la connexion à PostgreSQL **doit** être chiffrée et le certificat
serveur vérifié, sinon un attaquant sur le réseau peut intercepter/altérer le
trafic (man-in-the-middle).

## Avec Prisma

Prisma applique le TLS via la **connection string** (`DATABASE_URL`) — aucun code
applicatif à modifier. La valeur vient d'AWS Secrets Manager (ALP-139), jamais
d'un `.env` committé.

### Production / staging
```
postgresql://USER:PASS@HOST:5432/paybrain?sslmode=verify-full&sslrootcert=/etc/ssl/rds-ca-bundle.pem
```

- `sslmode=verify-full` : chiffre **et** vérifie que le hostname correspond au
  certificat (le plus strict ; bloque les MITM même avec un certificat valide
  mais d'un autre host).
- `sslrootcert` : chemin du **CA bundle RDS** embarqué dans l'image Docker
  (téléchargé depuis https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem).

### Développement local
`sslmode` est omis (Postgres local en clair sur `localhost`, pas de surface MITM).

## Image Docker (prod)

Ajouter au Dockerfile runner :
```dockerfile
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds-ca-bundle.pem
```

## Vérification

- Au déploiement, vérifier que la connexion échoue si le certificat est invalide
  (ex. mauvais `sslrootcert`) → preuve que `verify-full` est bien actif.
- Postgres : `SHOW ssl;` côté serveur, et `SELECT ssl_is_used();` via
  l'extension `sslinfo` confirment le chiffrement de la session.

> Cette configuration est portée par la connection string (secret), pas par le
> code : rien à changer côté application, seulement la valeur de `DATABASE_URL`
> en staging/prod et le CA bundle dans l'image.
