import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('API public routes (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health returns service health payload', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    const body = response.body as {
      status?: unknown;
      database?: unknown;
      timestamp?: unknown;
    };

    expect(typeof body.status).toBe('string');
    expect(typeof body.database).toBe('string');
    expect(typeof body.timestamp).toBe('string');
    expect(['ok', 'degraded']).toContain(body.status);
    expect(['up', 'down']).toContain(body.database);
  });
});
