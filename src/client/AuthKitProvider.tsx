import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { getGlobalStartContext } from '@tanstack/react-start';
import { checkSessionAction, refreshAuthAction, switchToOrganizationAction } from '../server/actions.js';
import { signOut } from '../server/server-functions.js';
import type { AuthContextType, AuthKitProviderProps } from './types.js';
import type { User, Impersonator } from '../types.js';
import type { ClientAuthResult } from '../server/server-functions.js';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthKitProvider({ children, onSessionExpired }: AuthKitProviderProps) {
  const hydratedAuth = (getGlobalStartContext()?.context as { auth?: () => ClientAuthResult } | undefined)?.auth?.();
  const initialAuth: ClientAuthResult = hydratedAuth ?? { user: null };
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(initialAuth.user);
  const [sessionId, setSessionId] = useState<string | undefined>(initialAuth.user ? initialAuth.sessionId : undefined);
  const [organizationId, setOrganizationId] = useState<string | undefined>(
    'organizationId' in initialAuth ? initialAuth.organizationId : undefined,
  );
  const [role, setRole] = useState<string | undefined>('role' in initialAuth ? initialAuth.role : undefined);
  const [roles, setRoles] = useState<string[] | undefined>('roles' in initialAuth ? initialAuth.roles : undefined);
  const [permissions, setPermissions] = useState<string[] | undefined>(
    'permissions' in initialAuth ? initialAuth.permissions : undefined,
  );
  const [entitlements, setEntitlements] = useState<string[] | undefined>(
    'entitlements' in initialAuth ? initialAuth.entitlements : undefined,
  );
  const [featureFlags, setFeatureFlags] = useState<string[] | undefined>(
    'featureFlags' in initialAuth ? initialAuth.featureFlags : undefined,
  );
  const [impersonator, setImpersonator] = useState<Impersonator | undefined>(
    'impersonator' in initialAuth ? initialAuth.impersonator : undefined,
  );
  const [loading, setLoading] = useState(false);

  // Compat: expose getAuth but now sync with hydrated context (no initial fetch).
  const getAuth = useCallback(async () => {
    return;
  }, []);

  const refreshAuth = useCallback(
    async ({ ensureSignedIn = false, organizationId }: { ensureSignedIn?: boolean; organizationId?: string } = {}) => {
      try {
        setLoading(true);
        const auth = await refreshAuthAction({ data: { ensureSignedIn, organizationId } });

        setUser(auth.user);
        setSessionId(auth.user ? auth.sessionId : undefined);
        setOrganizationId('organizationId' in auth ? auth.organizationId : undefined);
        setRole('role' in auth ? auth.role : undefined);
        setRoles('roles' in auth ? auth.roles : undefined);
        setPermissions('permissions' in auth ? auth.permissions : undefined);
        setEntitlements('entitlements' in auth ? auth.entitlements : undefined);
        setFeatureFlags('featureFlags' in auth ? auth.featureFlags : undefined);
        setImpersonator('impersonator' in auth ? auth.impersonator : undefined);
      } catch (error) {
        return error instanceof Error ? { error: error.message } : { error: String(error) };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleSignOut = useCallback(
    async ({ returnTo }: { returnTo?: string } = {}) => {
      try {
        await signOut({ data: { returnTo } });
      } catch (error) {
        // Server function throws redirect - extract URL and navigate appropriately
        if (error instanceof Response) {
          const location = error.headers.get('Location');
          if (location) {
            // Check if external URL (WorkOS logout) or internal route
            const isExternal = location.startsWith('http') && !location.includes(window.location.host);
            if (isExternal) {
              // External OAuth/logout URL requires full page navigation
              window.location.href = location;
            } else {
              // Internal routes use TanStack Router navigation
              navigate({ to: location });
            }
            return;
          }
        }
        throw error;
      }
    },
    [navigate],
  );

  const handleSwitchToOrganization = useCallback(async (organizationId: string) => {
    try {
      setLoading(true);
      const auth = await switchToOrganizationAction({ data: { organizationId } });

      if (!auth.user) {
        setUser(null);
        setSessionId(undefined);
        setOrganizationId(undefined);
        setRole(undefined);
        setRoles(undefined);
        setPermissions(undefined);
        setEntitlements(undefined);
        setFeatureFlags(undefined);
        setImpersonator(undefined);
        return;
      }

      setUser(auth.user);
      setSessionId(auth.sessionId);
      setOrganizationId(auth.organizationId);
      setRole(auth.role);
      setRoles(auth.roles);
      setPermissions(auth.permissions);
      setEntitlements(auth.entitlements);
      setFeatureFlags(auth.featureFlags);
      setImpersonator(auth.impersonator);
    } catch (error) {
      return error instanceof Error ? { error: error.message } : { error: String(error) };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (onSessionExpired === false) {
      return;
    }

    let visibilityChangedCalled = false;

    const handleVisibilityChange = async () => {
      if (visibilityChangedCalled) {
        return;
      }

      if (document.visibilityState === 'visible') {
        visibilityChangedCalled = true;

        try {
          const hasSession = await checkSessionAction();
          if (!hasSession) {
            throw new Error('Session expired');
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('Failed to fetch')) {
            if (onSessionExpired) {
              onSessionExpired();
            } else {
              window.location.reload();
            }
          }
        } finally {
          visibilityChangedCalled = false;
        }
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onSessionExpired]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      sessionId,
      organizationId,
      role,
      roles,
      permissions,
      entitlements,
      featureFlags,
      impersonator,
      loading,
      getAuth,
      refreshAuth,
      signOut: handleSignOut,
      switchToOrganization: handleSwitchToOrganization,
    }),
    [
      entitlements,
      featureFlags,
      getAuth,
      handleSignOut,
      handleSwitchToOrganization,
      impersonator,
      loading,
      organizationId,
      permissions,
      refreshAuth,
      role,
      roles,
      sessionId,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(options: {
  ensureSignedIn: true;
}): AuthContextType & ({ loading: true; user: User | null } | { loading: false; user: User });
export function useAuth(options?: { ensureSignedIn?: false }): AuthContextType;
export function useAuth({ ensureSignedIn = false }: { ensureSignedIn?: boolean } = {}) {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthKitProvider');
  }

  return context;
}
