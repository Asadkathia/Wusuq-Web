import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api';

export default function () {
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  });

  const reportsRes = http.get(`${BASE_URL}/reports`, {
    headers: {
      Authorization: `Bearer ${__ENV.BEARER_TOKEN || ''}`,
    },
  });

  check(reportsRes, {
    'reports auth returns expected status': (r) => r.status === 200 || r.status === 401,
  });

  sleep(1);
}
