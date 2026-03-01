import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // 1. Loud alert to see if this file is executing at all
  console.log('🔥 MIDDLEWARE TRIGGERED FOR PATH:', request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({ request })

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // 2. Check what Supabase is actually seeing
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
      console.log('⚠️ SUPABASE AUTH ERROR:', error.message);
    }
    
    console.log('👤 MIDDLEWARE USER CHECK:', user ? user.email : 'NO USER FOUND');

    // 3. The Bounce Logic
    if (!user && !request.nextUrl.pathname.startsWith('/login')) {
      console.log('🚨 BOUNCING UNAUTHENTICATED USER TO /login');
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    return supabaseResponse

  } catch (error) {
    // 4. Catching catastrophic failures (like missing ENV vars in Edge runtime)
    console.error('❌ CATASTROPHIC MIDDLEWARE ERROR:', error);
    return supabaseResponse;
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}