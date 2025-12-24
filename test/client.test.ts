import { describe, it, expect, vi } from 'vitest';
import { GagaraBoostClient, GagaraBoostError } from '../src/index.js';

interface MockResponse {
  status: number;
  body?: unknown;
  rawText?: string;
  arrayBuffer?: ArrayBuffer;
}

function createMockFetch(responses: Record<string, MockResponse>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.href;
    const parsed = new URL(url);
    const method = init?.method ?? 'GET';
    const key = `${method} ${parsed.pathname}${parsed.search}`;

    const response = responses[key];
    if (!response) {
      throw new Error(`No mock for: ${key}`);
    }

    const rawText =
      response.rawText ?? (response.body === undefined ? '' : JSON.stringify(response.body));
    const buffer = response.arrayBuffer ?? new TextEncoder().encode(rawText).buffer;

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => rawText,
      arrayBuffer: async () => buffer,
    } as Response;
  });
}

describe('GagaraBoostClient', () => {
  it('adds Authorization header when token is provided', async () => {
    const mockFetch = createMockFetch({
      'GET /workspaces': { status: 200, body: [] },
    });

    const client = new GagaraBoostClient({
      baseUrl: 'https://boost.test',
      token: 'token-123',
      fetch: mockFetch,
    });

    await client.listWorkspaces();

    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('creates a workspace with a string name', async () => {
    const mockFetch = createMockFetch({
      'POST /workspaces': { status: 200, body: { id: 'w1' } },
    });

    const client = new GagaraBoostClient({
      baseUrl: 'https://boost.test',
      fetch: mockFetch,
    });

    await client.createWorkspace('demo');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://boost.test/workspaces',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'demo' }),
      })
    );
  });

  it('uploads a dataset using form data', async () => {
    const mockFetch = createMockFetch({
      'POST /datasets': { status: 201, body: { dataset_id: 'ds1', created_at: 'now' } },
    });

    const client = new GagaraBoostClient({
      baseUrl: 'https://boost.test',
      fetch: mockFetch,
    });

    const data = new Uint8Array([1, 2, 3]);
    await client.uploadDataset(data, {
      workspaceId: 'ws1',
      alias: 'train-data',
      filename: 'train.parquet',
    });

    const body = mockFetch.mock.calls[0]?.[1]?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const entries = Array.from(body.entries());
    expect(entries).toEqual(
      expect.arrayContaining([
        ['workspace_id', 'ws1'],
        ['alias', 'train-data'],
      ])
    );
  });

  it('passes model id as query parameter for predict', async () => {
    const mockFetch = createMockFetch({
      'POST /predict/?id=model-1': { status: 200, body: { predictions: [1] } },
    });

    const client = new GagaraBoostClient({
      baseUrl: 'https://boost.test',
      fetch: mockFetch,
    });

    await client.predict('model-1', { features: [] });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://boost.test/predict/?id=model-1',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws GagaraBoostError with detail message', async () => {
    const mockFetch = createMockFetch({
      'GET /workspaces/bad': { status: 404, body: { detail: 'Not found' } },
    });

    const client = new GagaraBoostClient({
      baseUrl: 'https://boost.test',
      fetch: mockFetch,
    });

    const promise = client.getWorkspace('bad');
    await expect(promise).rejects.toThrow(GagaraBoostError);
    await expect(promise).rejects.toThrow('Not found');
  });
});
