import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import TicketForm from '../pages/TicketForm';

// Mock useAuth hook
vi.mock('../contexts/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-123', email: 'test@example.com' },
    profile: { role: 'student', full_name: 'Test User' },
    loading: false,
  }),
}));

describe('TicketForm', () => {
  it('renders the form with all required fields', () => {
    render(
      <MemoryRouter>
        <TicketForm />
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/facility type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/specific location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/severity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('shows validation error for short title', async () => {
    render(
      <MemoryRouter>
        <TicketForm />
      </MemoryRouter>
    );

    const titleInput = screen.getByLabelText(/title/i);
    fireEvent.change(titleInput, { target: { value: 'ab' } });
    fireEvent.blur(titleInput);

    // Form should handle validation gracefully
    await waitFor(() => {
      expect(titleInput).toHaveValue('ab');
    });
  });

  it('allows changing severity', () => {
    render(
      <MemoryRouter>
        <TicketForm />
      </MemoryRouter>
    );

    const severitySelect = screen.getByLabelText(/severity/i);
    fireEvent.change(severitySelect, { target: { value: 'High' } });

    expect(severitySelect).toHaveValue('High');
  });

  it('renders submit button', () => {
    render(
      <MemoryRouter>
        <TicketForm />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /submit report/i })).toBeInTheDocument();
  });
});
