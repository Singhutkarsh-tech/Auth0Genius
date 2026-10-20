import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
const network = vi.hoisted(() => ({ lookup: vi.fn(), get: vi.fn() }));
vi.mock('node:dns/promises', () => ({ default: { lookup: network.lookup } }));
vi.mock('node:https', () => ({ default: { get: network.get } }));
import { fetchDocument } from '@/lib/research/network';
afterEach(() => vi.clearAllMocks());
function respond(status: number, headers: Record<string, string>, body = '') {
  network.get.mockImplementationOnce((_url, options, callback) => {
    const request = new EventEmitter() as EventEmitter & {
      setTimeout: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
    };
    request.setTimeout = vi.fn();
    request.destroy = vi.fn((error) => request.emit('error', error));
    queueMicrotask(() => {
      const response = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
        resume: ReturnType<typeof vi.fn>;
        destroy: ReturnType<typeof vi.fn>;
      };
      response.statusCode = status;
      response.headers = headers;
      response.resume = vi.fn();
      response.destroy = vi.fn();
      callback(response);
      options.lookup('docs.example.com', {}, (error: unknown, address: string) => {
        if (error) throw error;
        expect(address).toBe('8.8.8.8');
      });
      queueMicrotask(() => {
        if (body) response.emit('data', Buffer.from(body));
        response.emit('end');
        request.emit('close');
      });
    });
    return request;
  });
}
describe('Safe retrieval connection behavior', () => {
  it('rejects a hostname resolving to private space before making a connection', async () => {
    network.lookup.mockResolvedValueOnce([{ address: '10.0.0.2', family: 4 }]);
    await expect(fetchDocument('https://docs.example.com')).rejects.toThrow('Private');
    expect(network.get).not.toHaveBeenCalled();
  });
  it('rejects a mixed public/private DNS answer', async () => {
    network.lookup.mockResolvedValueOnce([
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(fetchDocument('https://docs.example.com')).rejects.toThrow('Private');
    expect(network.get).not.toHaveBeenCalled();
  });
  it('rechecks and blocks a redirect into metadata space', async () => {
    network.lookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]);
    respond(302, { location: 'https://169.254.169.254/latest/meta-data' });
    await expect(fetchDocument('https://docs.example.com')).rejects.toThrow('public HTTPS');
    expect(network.get).toHaveBeenCalledTimes(1);
  });
  it('pins the resolved public address and removes scripts from retrieved text', async () => {
    network.lookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]);
    respond(
      200,
      { 'content-type': 'text/html' },
      `<title>OAuth setup</title><main>${'Documented OAuth instructions. '.repeat(10)}<script>maliciousInstruction()</script></main>`,
    );
    const page = await fetchDocument('https://docs.example.com');
    expect(page.title).toBe('OAuth setup');
    expect(page.text).toContain('Documented OAuth');
    expect(page.text).not.toContain('maliciousInstruction');
    expect(network.get.mock.calls[0][1].lookup).toBeTypeOf('function');
    const lookup = network.get.mock.calls[0][1].lookup;
    lookup('docs.example.com', { all: true }, (error: unknown, addresses: unknown) => {
      expect(error).toBeNull();
      expect(addresses).toEqual([{ address: '8.8.8.8', family: 4 }]);
    });
  });
  it('keeps a bounded readable prefix from oversized pages and marks it incomplete', async () => {
    network.lookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]);
    respond(
      200,
      { 'content-type': 'text/html' },
      `<title>Figma design</title><main>${'Figma is a collaborative design platform. '.repeat(30000)}</main>`,
    );
    const page = await fetchDocument('https://www.figma.com');
    expect(page.truncated).toBe(true);
    expect(page.title).toBe('Figma design');
    expect(page.text).toContain('collaborative design platform');
  });
});
