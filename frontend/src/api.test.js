import { describe, it, expect, vi, afterEach } from 'vitest';
import { listEmployees, createEmployee, updateEmployee, deleteEmployee } from './api.js';

// Helper: replace the browser's fetch with a fake that returns a chosen response
function fakeFetch(status, body) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('api.js', () => {
  it('listEmployees calls /api/employees with an encoded search term', async () => {
    const fetch = fakeFetch(200, [{ id: 1 }]);
    const result = await listEmployees('a b&c');
    expect(fetch).toHaveBeenCalledWith('/api/employees?search=a%20b%26c', expect.any(Object));
    expect(result).toEqual([{ id: 1 }]);
  });

  it('createEmployee sends a POST with a JSON body', async () => {
    const fetch = fakeFetch(201, { id: 5 });
    await createEmployee({ full_name: 'Test' });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/api/employees');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ full_name: 'Test' });
  });

  it('updateEmployee sends a PUT to the employee id', async () => {
    const fetch = fakeFetch(200, { id: 3 });
    await updateEmployee(3, { full_name: 'Changed' });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/api/employees/3');
    expect(options.method).toBe('PUT');
  });

  it('deleteEmployee sends a DELETE and returns null for 204 No Content', async () => {
    const fetch = fakeFetch(204, null);
    const result = await deleteEmployee(7);
    expect(fetch.mock.calls[0][0]).toBe('/api/employees/7');
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
    expect(result).toBeNull();
  });

  it('throws the server error message when the response is not ok', async () => {
    fakeFetch(409, { error: 'That email already exists' });
    await expect(createEmployee({})).rejects.toThrow('That email already exists');
  });

  it('throws a fallback message when the server sends no error text', async () => {
    fakeFetch(500, {});
    await expect(listEmployees()).rejects.toThrow('Request failed');
  });
});
