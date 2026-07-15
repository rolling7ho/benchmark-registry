import crypto from 'node:crypto';

import { runner } from 'node-pg-migrate';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/application.js';
import { createDatabase, type Database } from '../../src/db/database.js';
import { createModel } from '../../src/db/models.js';
import { seedOrganizations } from '../../src/db/seed-organizations.js';

const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

const ADMIN_AUTHORIZATION = `Basic ${Buffer.from('reviewer:a-long-test-password').toString('base64')}`;
const WRONG_AUTHORIZATION = `Basic ${Buffer.from('reviewer:wrong-password').toString('base64')}`;

function multipartPayload(
  boundary: string,
  fields: Record<string, string>,
  file: {
    field: string;
    filename: string;
    contentType: string;
    content: string;
  },
): string {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    );
  }
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n${file.content}\r\n`,
  );
  parts.push(`--${boundary}--\r\n`);
  return parts.join('');
}

describe.skipIf(integrationDatabaseUrl === undefined)(
  'admin ingestion review UI',
  () => {
    let database: Database;
    let app: FastifyInstance;
    const sourceUrl = 'https://example.test/admin-ingest-report';

    beforeAll(async () => {
      await runner({
        databaseUrl: integrationDatabaseUrl as string,
        dir: 'migrations',
        direction: 'up',
        migrationsTable: 'pgmigrations',
        verbose: false,
      });
      database = createDatabase(integrationDatabaseUrl as string);
      await seedOrganizations(database);
    });

    beforeEach(async () => {
      await database.deleteFrom('ingestion_candidates').execute();
      await database.deleteFrom('ingestion_jobs').execute();
      await database.deleteFrom('benchmark_records').execute();
      await database.deleteFrom('benchmark_versions').execute();
      await database.deleteFrom('model_snapshots').execute();
      await database.deleteFrom('benchmark_aliases').execute();
      await database.deleteFrom('model_aliases').execute();
      await database.deleteFrom('models').execute();
      await database.deleteFrom('benchmarks').execute();
      await database.deleteFrom('metrics').execute();
      await database.deleteFrom('sources').execute();
      await database.deleteFrom('registry_metadata').execute();
      await createModel(database, {
        organizationSlug: 'openai',
        officialName: 'GPT-5.5',
        family: 'GPT',
        modelNumber: '55',
      });
      const benchmark = await database
        .insertInto('benchmarks')
        .values({
          slug: 'gpqa-diamond',
          name: 'GPQA Diamond',
          organization_name: null,
          version: null,
          status: 'ACTIVE',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await database
        .insertInto('benchmark_versions')
        .values({
          benchmark_id: benchmark.id,
          version_label: null,
          variant_name: null,
          canonical_reference: 'gpqa-diamond/default',
          status: 'ACTIVE',
          release_date: null,
          notes: null,
        })
        .execute();
      await database
        .insertInto('metrics')
        .values({
          slug: 'accuracy',
          name: 'Accuracy',
          unit: '%',
          higher_is_better: true,
        })
        .execute();
      await database
        .insertInto('sources')
        .values({
          url: sourceUrl,
          title: 'Admin ingestion fixture',
          source_type: 'PROVIDER_REPORT',
          publisher: 'Example',
          published_date: null,
          accessed_at: new Date(),
        })
        .execute();

      app = createApp({
        database,
        closeDatabaseOnShutdown: false,
        adminAuth: { username: 'reviewer', password: 'a-long-test-password' },
      });
    });

    afterAll(async () => {
      await database?.destroy();
    });

    function upload(markdown: string): Promise<{
      statusCode: number;
      headers: Record<string, string | number | string[] | undefined>;
    }> {
      const boundary = `----test${crypto.randomUUID()}`;
      const body = multipartPayload(
        boundary,
        { source: sourceUrl },
        {
          field: 'file',
          filename: `report-${crypto.randomUUID()}.md`,
          contentType: 'text/markdown',
          content: markdown,
        },
      );
      return app.inject({
        method: 'POST',
        url: '/admin/ingest/file',
        headers: {
          authorization: ADMIN_AUTHORIZATION,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
    }

    it('rejects requests without valid administrator credentials', async () => {
      const anonymous = await app.inject({ method: 'GET', url: '/admin' });
      expect(anonymous.statusCode).toBe(401);

      const wrongPassword = await app.inject({
        method: 'GET',
        url: '/admin/ingest',
        headers: { authorization: WRONG_AUTHORIZATION },
      });
      expect(wrongPassword.statusCode).toBe(401);
    });

    it('renders the admin dashboard and ingestion queue for authorized requests', async () => {
      const dashboard = await app.inject({
        method: 'GET',
        url: '/admin',
        headers: { authorization: ADMIN_AUTHORIZATION },
      });
      expect(dashboard.statusCode).toBe(200);
      expect(dashboard.body).toContain('/admin/ingest');

      const ingestList = await app.inject({
        method: 'GET',
        url: '/admin/ingest',
        headers: { authorization: ADMIN_AUTHORIZATION },
      });
      expect(ingestList.statusCode).toBe(200);
      expect(ingestList.body).toContain('No ingestion jobs yet.');
    });

    it('rejects file ingestion against a source that was never created', async () => {
      const boundary = `----test${crypto.randomUUID()}`;
      const body = multipartPayload(
        boundary,
        { source: 'https://example.test/unknown-source' },
        {
          field: 'file',
          filename: 'report.md',
          contentType: 'text/markdown',
          content:
            '## GPQA Diamond\n| Model | Accuracy |\n| --- | --- |\n| GPT-5.5 | 88.1% |',
        },
      );
      const response = await app.inject({
        method: 'POST',
        url: '/admin/ingest/file',
        headers: {
          authorization: ADMIN_AUTHORIZATION,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(response.statusCode).toBe(400);
      expect(response.body).toContain('does not exist');
    });

    it('walks a candidate from file upload through preview to publication', async () => {
      const started = await upload(
        '## GPQA Diamond\n| Model | Accuracy |\n| --- | --- |\n| GPT-5.5 | 88.1% |',
      );
      expect(started.statusCode).toBe(303);
      const jobLocation = String(started.headers.location);
      expect(jobLocation).toMatch(/^\/admin\/ingest\/jobs\/IJ-\d{6}$/);

      const jobPage = await app.inject({
        method: 'GET',
        url: jobLocation,
        headers: { authorization: ADMIN_AUTHORIZATION },
      });
      expect(jobPage.statusCode).toBe(200);
      expect(jobPage.body).toContain('REVIEW_REQUIRED');
      const candidateMatch = /\/admin\/ingest\/candidates\/(IC-\d{6})/.exec(
        jobPage.body,
      );
      expect(candidateMatch).not.toBeNull();
      const candidateReference = candidateMatch![1]!;

      const candidatePage = await app.inject({
        method: 'GET',
        url: `/admin/ingest/candidates/${candidateReference}`,
        headers: { authorization: ADMIN_AUTHORIZATION },
      });
      expect(candidatePage.statusCode).toBe(200);
      expect(candidatePage.body).toContain('OPNAI-55');
      expect(candidatePage.body).toContain('gpqa-diamond');

      const preview = await app.inject({
        method: 'POST',
        url: `/admin/ingest/candidates/${candidateReference}/preview`,
        headers: {
          authorization: ADMIN_AUTHORIZATION,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: '',
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.body).toContain('GPT-5.5');
      expect(preview.body).toContain('Assigned on confirmation');

      const publish = await app.inject({
        method: 'POST',
        url: `/admin/ingest/candidates/${candidateReference}/publish`,
        headers: {
          authorization: ADMIN_AUTHORIZATION,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: '',
      });
      expect(publish.statusCode).toBe(303);
      const recordLocation = String(publish.headers.location);
      expect(recordLocation).toMatch(
        new RegExp(
          `^/admin/ingest/candidates/${candidateReference}\\?published=BR-`,
        ),
      );

      const publishedCandidatePage = await app.inject({
        method: 'GET',
        url: recordLocation,
        headers: { authorization: ADMIN_AUTHORIZATION },
      });
      expect(publishedCandidatePage.statusCode).toBe(200);
      expect(publishedCandidatePage.body).toContain('Published as');
      expect(publishedCandidatePage.body).toContain('PUBLISHED');
    });

    it('rejects a candidate with a reason and prevents re-review', async () => {
      const started = await upload(
        '## GPQA Diamond\n| Model | Accuracy |\n| --- | --- |\n| GPT-5.5 | 91.4% |',
      );
      const jobLocation = String(started.headers.location);
      const jobPage = await app.inject({
        method: 'GET',
        url: jobLocation,
        headers: { authorization: ADMIN_AUTHORIZATION },
      });
      const candidateReference = /\/admin\/ingest\/candidates\/(IC-\d{6})/.exec(
        jobPage.body,
      )![1]!;

      const rejection = await app.inject({
        method: 'POST',
        url: `/admin/ingest/candidates/${candidateReference}/reject`,
        headers: {
          authorization: ADMIN_AUTHORIZATION,
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: 'reason=Score+cannot+be+corroborated',
      });
      expect(rejection.statusCode).toBe(303);

      const candidatePage = await app.inject({
        method: 'GET',
        url: `/admin/ingest/candidates/${candidateReference}`,
        headers: { authorization: ADMIN_AUTHORIZATION },
      });
      expect(candidatePage.body).toContain('REJECTED');
      expect(candidatePage.body).toContain('Score cannot be corroborated');
      expect(candidatePage.body).not.toContain('Reject candidate</h2>');
    });
  },
);
