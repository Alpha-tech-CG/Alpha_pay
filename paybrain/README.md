# PayBrain Legacy Express API

This directory contains the first Express-based MVP implementation. It is kept
for historical reference and sandbox notes only.

The active backend is the NestJS API in `apps/api`, with shared Prisma models in
`packages/database` and provider integrations in `packages/connectors`.

Do not add new production code here unless the project explicitly reopens the
legacy Express service.
