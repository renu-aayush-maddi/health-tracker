import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAddress, sendViaHttpApi } from '../src/utils/mailer.js';

afterEach(() => vi.unstubAllGlobals());

const message = {
  from: 'Health Tracker <no-reply@example.com>',
  to: 'asha@example.com',
  subject: '123456 is your code',
  text: 'Your code is 123456',
  html: '<p>Your code is 123456</p>',
};

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('parseAddress', () => {
  it.each([
    [
      'Health Tracker <no-reply@example.com>',
      { name: 'Health Tracker', email: 'no-reply@example.com' },
    ],
    [
      '"Health Tracker" <no-reply@example.com>',
      { name: 'Health Tracker', email: 'no-reply@example.com' },
    ],
    ['no-reply@example.com', { email: 'no-reply@example.com' }],
  ])('parses %s', (input, expected) => {
    expect(parseAddress(input)).toEqual(expected);
  });
});

describe('HTTPS email providers', () => {
  it('posts to Brevo over port 443 with the api-key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { messageId: '<abc@brevo>' }));
    vi.stubGlobal('fetch', fetchMock);

    await sendViaHttpApi(message, 'brevo', 'brevo-key');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(new URL(url).protocol).toBe('https:'); // never an SMTP port
    expect(init.method).toBe('POST');
    expect(init.headers['api-key']).toBe('brevo-key');
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'Health Tracker', email: 'no-reply@example.com' },
      to: [{ email: 'asha@example.com' }],
      subject: message.subject,
      textContent: message.text,
      htmlContent: message.html,
    });
  });

  it('posts to Resend with a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'res_1' }));
    vi.stubGlobal('fetch', fetchMock);

    await sendViaHttpApi(message, 'resend', 'resend-key');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.authorization).toBe('Bearer resend-key');
    expect(JSON.parse(init.body)).toMatchObject({ from: message.from, to: ['asha@example.com'] });
  });

  it('retries once when the provider is temporarily unavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { message: 'try later' }))
      .mockResolvedValueOnce(jsonResponse(201, { messageId: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendViaHttpApi(message, 'brevo', 'k')).resolves.toMatchObject({ messageId: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails fast on a rejected key or unverified sender, without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'Key not found' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendViaHttpApi(message, 'brevo', 'wrong')).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a network failure, then gives up', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendViaHttpApi(message, 'resend', 'k')).rejects.toThrow(/fetch failed/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
