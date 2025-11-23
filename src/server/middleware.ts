import { createMiddleware } from '@tanstack/react-start';
import { authkit } from './authkit.js';
import { validateConfig } from '@workos/authkit-session';
import type { ClientAuthResult } from './server-functions.js';

// Track if we've validated config to avoid redundant checks
let configValidated = false;

/**
 * AuthKit middleware for TanStack Start.
 * Runs on every server request and stores authentication state in global context.
 *
 * @example
 * ```typescript
 * // In your start.ts
 * import { createStart } from '@tanstack/react-start';
 * import { authkitMiddleware } from '@workos/authkit-tanstack-start';
 *
 * export const startInstance = createStart(() => {
 *   return {
 *     requestMiddleware: [authkitMiddleware()],
 *   };
 * });
 * ```
 */
export const authkitMiddleware = () => {
  return createMiddleware().server(async (args) => {
    // Validate configuration on first request (fails fast with helpful errors)
    if (!configValidated) {
      validateConfig();
      configValidated = true;
    }

    // authkit.withAuth handles token validation, refresh, and session decryption
    const authResult = await authkit.withAuth(args.request);

    // Build a client-safe, serializable auth payload for hydration
    const hydratedAuth: ClientAuthResult = authResult.user
      ? {
          user: authResult.user,
          sessionId: authResult.sessionId!,
          organizationId: authResult.organizationId,
          role: authResult.role,
          roles: authResult.roles,
          permissions: authResult.permissions,
          entitlements: authResult.entitlements,
          featureFlags: authResult.claims?.feature_flags,
          impersonator: authResult.impersonator,
        }
      : { user: null };

    // Store full auth (with access token) in server context; hydrate sanitized auth to client
    return args.next({
      context: {
        auth: () => authResult,
      },
      sendContext: {
        auth: () => hydratedAuth,
      },
    });
  });
};
