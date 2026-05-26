import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse }                          from 'next/server';
import type { NextRequest }                      from 'next/server';

// ─── ROUTE MATCHERS ───────────────────────────────────────────────────────────
const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing',
  '/api/webhooks/(.*)',    // Stripe webhooks — no auth
  '/api/public/(.*)',      // Public market snapshot etc.
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/congress',            // Public SEO page
  '/blog(.*)',
  '/features(.*)',
]);

const isDashboardRoute = createRouteMatcher(['/dashboard(.*)']);
const isApiRoute       = createRouteMatcher(['/api/v1/(.*)']);

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
export default clerkMiddleware(async (auth, req: NextRequest) => {
  const { userId } = await auth();
  const url = req.nextUrl;

  // Public routes — no auth required
  if (isPublicRoute(req)) return NextResponse.next();

  // All other routes require auth
  if (!userId) {
    // API routes return 401 JSON
    if (isApiRoute(req)) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }
    // UI routes redirect to sign-in
    const signIn = new URL('/sign-in', url.origin);
    signIn.searchParams.set('redirect_url', url.pathname);
    return NextResponse.redirect(signIn);
  }

  // Add userId to headers for downstream API routes
  const headers = new Headers(req.headers);
  headers.set('x-clerk-user-id', userId);

  return NextResponse.next({ request: { headers } });
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
