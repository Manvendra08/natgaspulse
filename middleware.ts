import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PAGE_PREFIXES = ['/login', '/signup', '/forgot', '/auth/reset', '/auth/callback'];

function isPublicPage(pathname: string): boolean {
    if (pathname === '/') return true;
    return PUBLIC_PAGE_PREFIXES.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

function isAuthEntryPage(pathname: string): boolean {
    return pathname === '/login' || pathname === '/signup';
}

function isApiRoute(pathname: string): boolean {
    return pathname.startsWith('/api/');
}

function redirectToLanding(request: NextRequest): NextResponse {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/';
    redirectUrl.search = '';
    const requestedPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    if (requestedPath && requestedPath !== '/') {
        redirectUrl.searchParams.set('redirect', requestedPath);
    }
    return NextResponse.redirect(redirectUrl);
}

function unauthorizedApiResponse(): NextResponse {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const publicPage = isPublicPage(pathname);
    const authEntryPage = isAuthEntryPage(pathname);
    const apiRoute = isApiRoute(pathname);
    const requiresAuth = apiRoute || !publicPage;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        if (!requiresAuth) return NextResponse.next();
        return apiRoute ? unauthorizedApiResponse() : redirectToLanding(request);
    }

    const response = NextResponse.next({
        request: {
            headers: request.headers
        }
    });

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) => {
                    response.cookies.set(name, value, options);
                });
            }
        }
    });

    let user = null;
    try {
        const {
            data: { user: authUser }
        } = await supabase.auth.getUser();
        user = authUser;
    } catch {
        user = null;
    }

    if (authEntryPage && user) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/dashboard';
        redirectUrl.search = '';
        return NextResponse.redirect(redirectUrl);
    }

    if (requiresAuth && !user) {
        return apiRoute ? unauthorizedApiResponse() : redirectToLanding(request);
    }

    return response;
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)).*)']
};
