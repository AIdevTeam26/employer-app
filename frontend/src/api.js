// All calls use a relative URL: nginx (Docker) or Vite (dev) forwards /api to the backend.
async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const listEmployees = (search = '') =>
  request(`/employees?search=${encodeURIComponent(search)}`);
export const createEmployee = (e) =>
  request('/employees', { method: 'POST', body: JSON.stringify(e) });
export const updateEmployee = (id, e) =>
  request(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(e) });
export const deleteEmployee = (id) =>
  request(`/employees/${id}`, { method: 'DELETE' });

// Upload an Excel file. mode: 'validate' (dry run) or 'commit' (write to the database).
// Uses FormData, so the browser sets the multipart Content-Type itself.
export async function importEmployees(file, { mode = 'validate', replaceExisting = true } = {}) {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/api/employees/import?mode=${mode}&replaceExisting=${replaceExisting}`, {
    method: 'POST',
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}
