'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient as createAuthClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function login(formData: FormData) {
  const supabase = await createAuthClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    console.error("🔥 LOGIN ERROR:", error.message)
    redirect('/login?error=Could not authenticate user')
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  const supabase = await createAuthClient()

  // 1. Grab all the form data
  const email = formData.get('email') as string
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