import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import type { ClientAuthResult } from '@workos/authkit-tanstack-react-start';

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    context: {
      // Type-safe auth context from middleware
      auth: undefined! as () => ClientAuthResult,
    },
  });

  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }

  interface RouterContext {
    auth: () => ClientAuthResult;
  }
}
