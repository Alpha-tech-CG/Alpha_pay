import { createS3Client } from './s3-client';

describe('createS3Client', () => {
  it('targets AWS S3 in AWS_REGION when no endpoint is configured', async () => {
    const client = createS3Client('eu-west-1', { AWS_REGION: 'af-south-1' } as NodeJS.ProcessEnv);
    expect(await client.config.region()).toBe('af-south-1');
    expect(client.config.endpoint).toBeUndefined();
  });

  it('falls back to the default region', async () => {
    const client = createS3Client('eu-west-1', {} as NodeJS.ProcessEnv);
    expect(await client.config.region()).toBe('eu-west-1');
  });

  it('targets an S3-compatible endpoint (OVH Object Storage) when S3_ENDPOINT is set', async () => {
    const client = createS3Client('eu-west-1', {
      S3_ENDPOINT: 'https://s3.gra.io.cloud.ovh.net',
      S3_REGION: 'gra',
      AWS_REGION: 'eu-west-1',
    } as NodeJS.ProcessEnv);

    expect(await client.config.region()).toBe('gra');
    const endpoint = await client.config.endpoint!();
    expect(endpoint.hostname).toBe('s3.gra.io.cloud.ovh.net');
    expect(client.config.forcePathStyle).toBe(false);
    expect(await client.config.requestChecksumCalculation()).toBe('WHEN_REQUIRED');
  });

  it('enables path-style addressing on demand (MinIO)', () => {
    const client = createS3Client('eu-west-1', {
      S3_ENDPOINT: 'http://minio:9000',
      S3_FORCE_PATH_STYLE: 'true',
    } as NodeJS.ProcessEnv);
    expect(client.config.forcePathStyle).toBe(true);
  });
});
