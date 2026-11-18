import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PAGES = new Set(['/login', '/signup']);

// Without the login cookie, every page sends you to /login. (The API checks the cookie properly.)
export function middleware(req: NextRequest) {
  if (!req.cookies.has('gw_token') && !PUBLIC_PAGES.has(req.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg|sky/).*)'],
};
