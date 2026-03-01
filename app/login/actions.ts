'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient as createAuthClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function login(formData: FormData) {
  const supabase = await createAuthClient()

  const identifier = (formData.get('identifier') as string).trim()
  const password = formData.get('password') as string

  let email = identifier

  // If the identifier doesn't look like an email, treat it as a username
  if (!identifier.includes('@')) {
    const dbAdmin = createAdminClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: profile, error: profileError } = await dbAdmin
      .from('profiles')
      .select('user_id')
      .eq('username', identifier)
      .single()

    if (profileError || !profile) {
      redirect('/login?error=Invalid username or password')
    }

    const { data: userData, error: userError } = await dbAdmin.auth.admin.getUserById(profile.user_id)

    if (userError || !userData.user) {
      redirect('/login?error=Invalid username or password')
    }

    email = userData.user.email!
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect('/login?error=Invalid username or password')
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  const supabase = await createAuthClient()

  // 1. Grab all the form data
  const email = formData.get('identifier') as string
  const password = formData.get('password') as string
  const username = formData.get('username') as string
  const firstName = formData.get('firstName') as string
  const lastName = formData.get('lastName') as string
  const dob = formData.get('dob') as string
  const phone = formData.get('phone') as string

  // 2. Create the Auth User
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  })

  // 3. Catch and log exact auth errors
  if (authError || !authData.user) {
    console.error("🔥 SUPABASE AUTH ERROR:", authError?.message || "No user returned")
    redirect('/login?error=Could not create account')
  }

  // 4. Save the extra data to the profiles table using the Admin client
  const dbAdmin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error: profileError } = await dbAdmin.from('profiles').insert({
    user_id: authData.user.id,
    username: username,
    first_name: firstName,
    last_name: lastName,
    // Convert empty strings from the form into true nulls for Postgres
    dob: dob ? dob : null, 
    phone: phone ? phone : null 
  })

  if (profileError) {
    console.error("❌ PROFILE CREATION ERROR:", profileError.message)
  }

  revalidatePath('/', 'layout')
  redirect('/')
}