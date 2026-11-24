import { createServer } from 'node:http';
import { parseWithdrawalRequest } from '@stellar-privacy/sdk';

const MAX_BODY = 8 * 1024;

/**
 * HTTP relayer. `info` is its address and minimum fee; `submit(request)` sends the withdrawal and resolves to its
 * hash. Requests run one at a time because the account's sequence number
 * cannot be shared. Request contents and client addresses are never logged.
 */
export function createRelayer({ info, submit, trustProxy = false, maxPerMinute = 10, maxQueue = 20 }) {
  let queue = Promise.resolve();
  let queued = 0;
  const recent = new Map();

  const limited = (address) => {
    const now = Date.now();
    for (const [key, times] of recent) if (now - times.at(-1) > 60_000) recent.delete(key);
    const times = (recent.get(address) ?? []).filter((t) => now - t < 60_000);
    if (times.length >= maxPerMinute) return true;
    recent.set(address, [...times, now]);
    return false;
  };

  // The last entry is the one added by our own proxy; earlier ones are client-supplied.
  const clientAddress = (req) =>
    (trustProxy && req.headers['x-forwarded-for']?.split(',').at(-1).trim()) ||
    req.socket.remoteAddress;

  return createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
      });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return reply(200, {});
    if (req.method === 'GET' && req.url === '/health') return reply(200, { status: 'ok' });
    if (req.method === 'GET' && req.url === '/info') return reply(200, info);
    if (req.method !== 'POST' || req.url !== '/withdraw') return reply(404, { error: 'Not found' });
    if (limited(clientAddress(req))) return reply(429, { error: 'Too many requests' });
    if (queued >= maxQueue) return reply(503, { error: 'Busy' });

    let request;
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > MAX_BODY) return reply(413, { error: 'Request too large' });
      }
      request = parseWithdrawalRequest(JSON.parse(body));
    } catch {
      return reply(400, { error: 'Invalid withdrawal request' });
    }
    if (request.relayer !== info.address || BigInt(request.fee) < BigInt(info.fee)) {
      return reply(400, { error: 'Wrong relayer or fee too low' });
    }
    queued++;
    const result = queue.then(() => submit(request));
    queue = result.catch(() => {});
    try {
      reply(200, { txHash: await result });
    } catch {
      reply(422, { error: 'Withdrawal was rejected' });
    } finally {
      queued--;
    }
  });
}
