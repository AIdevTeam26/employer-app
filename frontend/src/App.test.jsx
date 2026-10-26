import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.jsx';
import * as api from './api.js';

// Replace the real API with fakes so tests never need the backend or database.
vi.mock('./api.js', () => ({
  listEmployees: vi.fn(),
  createEmployee: vi.fn(),
  updateEmployee: vi.fn(),
  deleteEmployee: vi.fn(),
  importEmployees: vi.fn(),
}));

const priya = {
  id: 1, full_name: 'Priya Raman', email: 'priya@example.com', department: 'Engineering',
  position: 'Backend Developer', salary: '1200000.00', hire_date: '2023-04-10',
};
const arjun = {
  id: 2, full_name: 'Arjun Kumar', email: 'arjun@example.com', department: 'Design',
  position: 'UI Designer', salary: '950000.00', hire_date: '2022-11-01',
};

beforeEach(() => {
  vi.resetAllMocks();
  api.listEmployees.mockResolvedValue([priya, arjun]);
});

afterEach(() => vi.unstubAllGlobals());

describe('<App />', () => {
  it('shows the employees returned by the API', async () => {
    render(<App />);
    expect(await screen.findByText('Priya Raman')).toBeInTheDocument();
    expect(screen.getByText('Arjun Kumar')).toBeInTheDocument();
    expect(screen.getByText('2 people on your team')).toBeInTheDocument();
  });

  it('shows the empty state when there are no employees', async () => {
    api.listEmployees.mockResolvedValue([]);
    render(<App />);
    await waitFor(() => expect(api.listEmployees).toHaveBeenCalled());
    expect(screen.getByText(/no employees found/i)).toBeInTheDocument();
  });

  it('shows an error banner when loading fails', async () => {
    api.listEmployees.mockRejectedValue(new Error('Database is down'));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Database is down');
  });

  it('searches using the text typed in the search box', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Priya Raman');
    await user.type(screen.getByLabelText('Search employees'), 'pri');
    await waitFor(() => expect(api.listEmployees).toHaveBeenLastCalledWith('pri'));
  });

  it('adds an employee and clears the form', async () => {
    const user = userEvent.setup();
    api.createEmployee.mockResolvedValue({ id: 3 });
    render(<App />);
    await screen.findByText('Priya Raman');

    await user.type(screen.getByLabelText('Full name'), 'New Person');
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Department'), 'Sales');
    await user.type(screen.getByLabelText('Position'), 'Rep');
    await user.type(screen.getByLabelText('Salary (yearly)'), '500000');
    await user.click(screen.getByRole('button', { name: 'Add employee' }));

    await waitFor(() =>
      expect(api.createEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'New Person', email: 'new@example.com',
          department: 'Sales', position: 'Rep', salary: '500000',
        })
      )
    );
    await waitFor(() => expect(screen.getByLabelText('Full name')).toHaveValue(''));
  });

  it('shows the server message when adding fails (duplicate email)', async () => {
    const user = userEvent.setup();
    api.createEmployee.mockRejectedValue(new Error('That email already exists'));
    render(<App />);
    await screen.findByText('Priya Raman');

    await user.type(screen.getByLabelText('Full name'), 'Dup');
    await user.type(screen.getByLabelText('Email'), 'priya@example.com');
    await user.type(screen.getByLabelText('Department'), 'X');
    await user.type(screen.getByLabelText('Position'), 'Y');
    await user.click(screen.getByRole('button', { name: 'Add employee' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That email already exists');
  });

  it('edits an existing employee', async () => {
    const user = userEvent.setup();
    api.listEmployees.mockResolvedValue([priya]);
    api.updateEmployee.mockResolvedValue({ ...priya, full_name: 'Priya R' });
    render(<App />);
    await screen.findByText('Priya Raman');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('heading', { name: 'Edit employee' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Priya Raman');

    const name = screen.getByLabelText('Full name');
    await user.clear(name);
    await user.type(name, 'Priya R');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.updateEmployee).toHaveBeenCalledWith(1, expect.objectContaining({ full_name: 'Priya R' }))
    );
  });

  it('removes an employee after confirmation', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => true));
    api.listEmployees.mockResolvedValue([priya]);
    api.deleteEmployee.mockResolvedValue(null);
    render(<App />);
    await screen.findByText('Priya Raman');

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(api.deleteEmployee).toHaveBeenCalledWith(1));
  });

  it('does not remove an employee when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn(() => false));
    api.listEmployees.mockResolvedValue([priya]);
    render(<App />);
    await screen.findByText('Priya Raman');

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(api.deleteEmployee).not.toHaveBeenCalled();
  });
});
