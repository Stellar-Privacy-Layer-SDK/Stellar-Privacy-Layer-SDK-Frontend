import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRelayer } from './server.mjs';

const body = {
  root: '0x' + '1'.repeat(64),
  nullifier: '0x' + '2'.repeat(64),
  recipient: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  proof: { pi_a: ['1', '2'], pi_b: [['3', '4'], ['5', '6']], pi_c: ['7', '8'] },
};
const servers = [];
after(() => servers.forEach((s) => s.close()));
async function start(options) {
  const server = createRelayer(options);
  servers.push(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${server.address().port}`;
  return (data, path = '/withdraw') =>
    fetch(url + path, { method: 'POST', body: typeof data === 'string' ? data : JSON.stringify(data) });
}

test('submits one request at a time', async () => {
  let active = 0;
  let peak = 0;
  const post = await start({
    submit: async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return 'hash';
    },
  });
  const responses = await Promise.all([post(body), post(body), post(body)]);
  assert.deepEqual(await responses[0].json(), { txHash: 'hash' });
  assert.equal(peak, 1);
});

test('rejects bad input without submitting', async () => {
  const post = await start({ submit: () => assert.fail('submitted') });
  assert.equal((await post('{')).status, 400);
  assert.equal((await post({ ...body, root: 'x' })).status, 400);
  assert.equal((await post(' '.repeat(9000))).status, 413);
  assert.equal((await post(body, '/other')).status, 404);
});

test('hides internal errors and keeps working', async () => {
  let fail = true;
  const post = await start({
    submit: async () => {
      if (fail) throw new Error('internal detail');
      return 'ok';
    },
  });
  const response = await post(body);
  assert.equal(response.status, 422);
  assert.doesNotMatch(await response.text(), /internal/);
  fail = false;
  assert.equal((await post(body)).status, 200);
});

test('rate limits', async () => {
  const post = await start({ submit: async () => 'h', maxPerMinute: 1 });
  assert.equal((await post(body)).status, 200);
  assert.equal((await post(body)).status, 429);
});
