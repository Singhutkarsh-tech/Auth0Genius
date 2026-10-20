import dns from 'node:dns/promises';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
export function isPublicIp(value: string) {
  try {
    const ip = ipaddr.process(value);
    return ip.range() === 'unicast';
  } catch {
    return false;
  }
}
export function validateRemoteUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !host.includes('.') ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    (ipaddr.isValid(host) && !isPublicIp(host))
  )
    throw new Error('Only public HTTPS documentation URLs are allowed');
  return url;
}
export async function resolvePublic(value: string) {
  const url = validateRemoteUrl(value);
  const addresses = await Promise.race([
    dns.lookup(url.hostname, { all: true }),
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error('Documentation DNS lookup timed out')), 4000);
      timer.unref();
    }),
  ]);
  if (!addresses.length || addresses.some((a) => !isPublicIp(a.address)))
    throw new Error('Private or reserved destination blocked');
  return { url, address: addresses[0] };
}
export async function fetchDocument(
  value: string,
  redirects = 0,
  deadline = Date.now() + 20000,
): Promise<{ url: string; title: string; text: string; truncated?: boolean }> {
  if (Date.now() >= deadline) throw new Error('Documentation fetch deadline exceeded');
  if (redirects > 3) throw new Error('Too many documentation redirects');
  const { url, address } = await resolvePublic(value);
  const result = await new Promise<{ status: number; location?: string; body: string; truncated?: boolean }>(
    (resolve, reject) => {
      const request = https.get(
        url,
        {
          headers: {
            'User-Agent': 'Auth0Genius/0.1 (public OAuth documentation research)',
            Accept: 'text/html,text/plain,application/json',
          },
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [{ address: address.address, family: address.family }]);
            else callback(null, address.address, address.family);
          },
          timeout: 12000,
        },
        (res) => {
          const status = res.statusCode ?? 500;
          if (status >= 300 && status < 400) {
            res.resume();
            resolve({ status, location: res.headers.location, body: '' });
            return;
          }
          if (status !== 200) {
            res.resume();
            reject(new Error(`Documentation returned HTTP ${status}`));
            return;
          }
          const type = res.headers['content-type'] ?? '';
          if (!/text\/|application\/(json|xhtml)/i.test(type)) {
            res.resume();
            reject(new Error('Unsupported documentation content type'));
            return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            const remaining = 1_000_000 - size;
            if (chunk.length > remaining) {
              if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
              size = 1_000_000;
              // Keep the bounded prefix; large marketing pages often put identity text first.
              // Parsing remains conservative and later claims still require retained passages.
              resolve({
                status,
                body: Buffer.concat(chunks).toString('utf8'),
                truncated: true,
              });
              res.destroy();
              return;
            }
            size += chunk.length;
            chunks.push(chunk);
          });
          res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
          res.on('error', reject);
        },
      );
      const deadlineTimer = setTimeout(
        () => request.destroy(new Error('Documentation fetch deadline exceeded')),
        Math.max(1, deadline - Date.now()),
      );
      request.on('close', () => clearTimeout(deadlineTimer));
      request.setTimeout(12000, () => request.destroy(new Error('Documentation fetch timed out')));
      request.on('error', reject);
    },
  );
  if (result.location)
    return fetchDocument(new URL(result.location, url).toString(), redirects + 1, deadline);
  const $ = load(result.body);
  $('script,style,nav,footer,header,iframe,noscript').remove();
  const title = $('title').first().text().trim() || url.hostname;
  const text = ($('main').text() || $('article').text() || $('body').text() || result.body)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14000);
  if (text.length < 100) throw new Error('Documentation contains insufficient readable text');
  return { url: url.toString(), title, text, truncated: result.truncated };
}
