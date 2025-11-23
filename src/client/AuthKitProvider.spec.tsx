import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { AuthKitProvider, useAuth } from './AuthKitProvider';
import type { User } from '@workos/authkit-session';

vi.mock('../server/actions', () => ({
  refreshAuthAction: vi.fn(),
  checkSessionAction: vi.fn(),
  switchToOrganizationAction: vi.fn(),
}));

vi.mock('../server/server-functions', () => ({
  signOut: vi.fn(),
}));

// Mock TanStack Router hooks to avoid warnings
const mockNavigate = vi.fn();
let mockRouterAuth: any = { user: null };

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/' }),
}));

vi.mock('@tanstack/react-start', () => ({
  getGlobalStartContext: () => ({
    context: {
      auth: () => mockRouterAuth,
    },
  }),
}));

describe('AuthKitProvider', () => {
  const mockUser: User = {
    id: 'user_123',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    emailVerified: true,
    profilePictureUrl: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    lastSignInAt: '2024-01-01T00:00:00.000Z',
    externalId: null,
    locale: 'en',
    metadata: {},
    object: 'user',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterAuth = { user: null };
    mockNavigate.mockReset();
  });

  it('renders children', async () => {
    await act(async () => {
      render(
        <AuthKitProvider>
          <div>Test Child</div>
        </AuthKitProvider>,
      );
    });

    expect(screen.getByText('Test Child')).toBeDefined();
  });

  it('throws error when useAuth is called outside provider', () => {
    const TestComponent = () => {
      useAuth();
      return <div>Test</div>;
    };

    expect(() => render(<TestComponent />)).toThrow('useAuth must be used within an AuthKitProvider');
  });

  it('provides auth context to children', async () => {
    const TestComponent = () => {
      const { loading, user } = useAuth();
      return (
        <div>
          <div>{loading ? 'Loading' : 'Not Loading'}</div>
          <div>{user ? 'Has User' : 'No User'}</div>
        </div>
      );
    };

    render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    expect(screen.getByText('Not Loading')).toBeDefined();
    expect(screen.getByText('No User')).toBeDefined();
  });

  it('loads user data and provides to context', async () => {
    mockRouterAuth = {
      user: mockUser,
      sessionId: 'session_123',
      organizationId: 'org_123',
      role: 'admin',
      roles: ['admin', 'user'],
      permissions: ['read', 'write'],
      entitlements: ['feature_a'],
      featureFlags: ['flag_1'],
      impersonator: undefined,
    };

    const TestComponent = () => {
      const { user, sessionId, organizationId, role, roles, permissions, entitlements, featureFlags } = useAuth();
      return (
        <div>
          <div>{user?.email}</div>
          <div>{sessionId}</div>
          <div>{organizationId}</div>
          <div>{role}</div>
          <div>{roles?.join(',')}</div>
          <div>{permissions?.join(',')}</div>
          <div>{entitlements?.join(',')}</div>
          <div>{featureFlags?.join(',')}</div>
        </div>
      );
    };

    render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    expect(screen.getByText('test@example.com')).toBeDefined();
    expect(screen.getByText('session_123')).toBeDefined();
    expect(screen.getByText('org_123')).toBeDefined();
    expect(screen.getByText('admin')).toBeDefined();
    expect(screen.getByText('admin,user')).toBeDefined();
    expect(screen.getByText('read,write')).toBeDefined();
    expect(screen.getByText('feature_a')).toBeDefined();
    expect(screen.getByText('flag_1')).toBeDefined();
  });

  it('calls refreshAuth and updates state', async () => {
    const { refreshAuthAction } = await import('../server/actions');

    vi.mocked(refreshAuthAction).mockResolvedValue({
      user: mockUser,
      sessionId: 'new_session',
      organizationId: 'org_456',
    });

    const TestComponent = () => {
      const { user, refreshAuth } = useAuth();
      return (
        <div>
          <div>{user?.email || 'No User'}</div>
          <button onClick={() => refreshAuth()}>Refresh</button>
        </div>
      );
    };

    render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    expect(screen.getByText('No User')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });

    await waitFor(() => {
      expect(screen.getByText('test@example.com')).toBeDefined();
    });
  });

  it('calls signOut', async () => {
    const { signOut } = await import('../server/server-functions');

    mockRouterAuth = {
      user: mockUser,
      sessionId: 'session_123',
    };

    const TestComponent = () => {
      const { signOut: handleSignOut } = useAuth();
      return <button onClick={() => handleSignOut({ returnTo: '/home' })}>Sign Out</button>;
    };

    render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    expect(screen.getByText('Sign Out')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Sign Out'));
    });

    expect(signOut).toHaveBeenCalledWith({ data: { returnTo: '/home' } });
  });

  it('exposes null user when not authenticated (hydrated)', async () => {
    const TestComponent = () => {
      const { user } = useAuth();
      return <div>{user ? 'Has User' : 'No User'}</div>;
    };

    render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    expect(screen.getByText('No User')).toBeDefined();
  });

  it('handles refreshAuth errors', async () => {
    const { refreshAuthAction } = await import('../server/actions');

    vi.mocked(refreshAuthAction).mockRejectedValue(new Error('Refresh failed'));

    const TestComponent = () => {
      const { refreshAuth } = useAuth();
      return <button onClick={() => refreshAuth()}>Refresh</button>;
    };

    render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    expect(screen.getByText('Refresh')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Refresh'));
    });

    await waitFor(() => {
      expect(refreshAuthAction).toHaveBeenCalled();
    });
  });

  it('disables session expiry checks when onSessionExpired is false', async () => {
    await act(async () => {
      render(
        <AuthKitProvider onSessionExpired={false}>
          <div>Test</div>
        </AuthKitProvider>,
      );
    });

    expect(screen.getByText('Test')).toBeDefined();
  });

  it('does not refetch when ensureSignedIn is true (hydrated)', async () => {
    const { checkSessionAction } = await import('../server/actions');
    const TestComponent = () => {
      const { user } = useAuth({ ensureSignedIn: true });
      return <div>{user?.email || 'No User'}</div>;
    };

    render(
      <AuthKitProvider>
        <TestComponent />
      </AuthKitProvider>,
    );

    expect(screen.getByText('No User')).toBeDefined();
    expect(checkSessionAction).not.toHaveBeenCalled();
  });
});
