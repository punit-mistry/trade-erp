import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

/**
 * Next 16 "proxy" (formerly middleware). Handles the Convex Auth cookie-based
 * token exchange on /api/auth and redirects unauthenticated users. This is a
 * navigation convenience only: every Convex query/mutation enforces auth and
 * permissions itself.
 */
const isPublicPage = createRouteMatcher(["/signin"]);

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const authed = await convexAuth.isAuthenticated();
    if (isPublicPage(request) && authed) {
      return nextjsMiddlewareRedirect(request, "/dashboard");
    }
    if (!isPublicPage(request) && !authed) {
      return nextjsMiddlewareRedirect(request, "/signin");
    }
  },
  { cookieConfig: { maxAge: 60 * 60 * 24 * 14 } },
);

export const config = {
  // All routes except static assets and Next internals.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
