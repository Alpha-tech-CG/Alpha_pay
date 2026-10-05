import { S3Client } from '@aws-sdk/client-s3';

/**
 * Client S3 partagé par tous les stockages de documents (KYC, rapports de
 * réconciliation, bordereaux de reversement).
 *
 * Sans S3_ENDPOINT : AWS S3 (comportement historique, région AWS_REGION).
 * Avec S3_ENDPOINT : stockage compatible S3 hors AWS (OVH Object Storage, MinIO…).
 * Les identifiants viennent de la chaîne par défaut du SDK
 * (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY), injectés par le secrets-loader.
 */
export function createS3Client(defaultRegion: string, env: NodeJS.ProcessEnv = process.env): S3Client {
  const endpoint = env.S3_ENDPOINT;
  if (!endpoint) {
    return new S3Client({ region: env.AWS_REGION ?? defaultRegion });
  }

  return new S3Client({
    region: env.S3_REGION ?? env.AWS_REGION ?? defaultRegion,
    endpoint,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    // Le SDK v3 ajoute par défaut des checksums CRC32 (en-têtes + paramètres des
    // URL présignées) que les stockages compatibles S3 ne gèrent pas tous.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}
