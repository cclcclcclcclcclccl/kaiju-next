import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

export type TrustedProxy = 'none' | 'cloudflare' | 'caddy';
export function proxyMode(value = 'none'): TrustedProxy {
  if (value !== 'none' && value !== 'cloudflare' && value !== 'caddy')
    throw Error('KAIJU_TRUSTED_PROXY must be none, cloudflare or caddy');
  return value;
}

// Forwarded headers are accepted only from an explicitly configured, local proxy.
// The application must stay bound to loopback; Caddy must overwrite X-Forwarded-For.
export function clientAddress(
  req: Pick<IncomingMessage, 'headers' | 'socket'>,
  proxy: TrustedProxy,
) {
  const peer = req.socket.remoteAddress ?? 'unknown';
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer);
  const header = proxy === 'cloudflare' ? 'cf-connecting-ip' : 'x-forwarded-for';
  const forwarded = req.headers[header];
  const address =
    loopback && proxy !== 'none' && typeof forwarded === 'string' && isIP(forwarded)
      ? forwarded
      : peer;
  if (isIP(address) === 6) return new URL('http://[' + address + ']').hostname;
  return address;
}

export function createAuthLimiter(now = Date.now) {
  const attempts = new Map<string, { count: number; until: number }>();
  let sweepAt = 0;
  return (address: string, username: string): number => {
    const time = now();
    if (time >= sweepAt) {
      for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
      sweepAt = time + 60000;
    }
    // A shared campus connection has a larger budget; one account cannot consume it all.
    const limits: [string, number][] = [
      ['ip:' + address, 60],
      ['account:' + username, 20],
    ];
    for (const [key, limit] of limits) {
      const entry = attempts.get(key);
      if (entry && entry.until > time && entry.count >= limit)
        return Math.max(1, Math.ceil((entry.until - time) / 1000));
    }
    if (attempts.size + limits.filter(([key]) => !attempts.has(key)).length > 20000) return 60;
    for (const [key] of limits) {
      const entry = attempts.get(key);
      attempts.set(
        key,
        entry && entry.until > time
          ? { count: entry.count + 1, until: entry.until }
          : { count: 1, until: time + 60000 },
      );
    }
    return 0;
  };
}
