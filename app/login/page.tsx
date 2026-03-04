'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { login, signup } from './actions';

function LoginForm() {
  const [isSignUp, setIsSignUp] = useState(false);
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  // A reusable class string to keep our inputs looking perfectly uniform and the code clean
  const inputClass = "w-full p-3 mt-1.5 rounded-xl dark:bg-[#131314] bg-gray-50 dark:text-gray-100 text-gray-800 border dark:border-[#333537] border-gray-300 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all duration-200 dark:placeholder-gray-600 placeholder-gray-400 shadow-inner";
  const labelClass = "text-sm dark:text-gray-300 text-gray-600 font-medium ml-1";

  return (
    <div className="flex h-screen w-full items-center justify-center dark:bg-[#0d0d0e] bg-gray-50 dark:text-gray-100 text-gray-900 font-sans p-4">
      {/* Added a subtle shadow and refined the border radius for a premium card look */}
      <form className="flex flex-col w-full max-w-md dark:bg-[#1e1f20] bg-white p-8 sm:p-10 rounded-3xl border dark:border-[#333537] border-gray-200 shadow-2xl relative overflow-hidden">

        {/* Subtle decorative background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 dark:bg-indigo-500/10 bg-indigo-500/[0.06] blur-[50px] pointer-events-none"></div>

        <div className="relative z-10">
          <h1 className="text-3xl font-semibold text-center mb-2 tracking-tight dark:text-white text-gray-900">
            {isSignUp ? 'Create an Account' : 'Welcome Back'}
          </h1>
          <p className="text-sm dark:text-gray-400 text-gray-500 text-center mb-8">
            {isSignUp ? 'Sign up to start chatting with your AI.' : 'Log in to continue your conversations.'}
          </p>

          {error && (
            <div className="mb-6 flex items-center gap-3 dark:bg-red-500/10 bg-red-50 border dark:border-red-500/20 border-red-200 dark:text-red-400 text-red-600 px-4 py-3 rounded-xl text-sm animate-message-in">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0">
                <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <div className="space-y-5">
            {/* Dynamic Fields: Only visible during Sign Up */}
            {isSignUp && (
              <>
                <div>
                  <label className={labelClass} htmlFor="username">Username</label>
                  <input id="username" name="username" type="text" placeholder="skipper_fan_99" required={isSignUp} className={inputClass} />
                </div>

                {/* Swapped Flex for Grid to permanently fix the overlapping layout bug */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className={labelClass} htmlFor="firstName">First Name</label>
                    <input id="firstName" name="firstName" type="text" placeholder="Jarod" required={isSignUp} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="lastName">Last Name</label>
                    <input id="lastName" name="lastName" type="text" placeholder="Smith" required={isSignUp} className={inputClass} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className={labelClass} htmlFor="dob">Date of Birth <span className="text-gray-500 font-normal ml-1">(Opt)</span></label>
                    <input id="dob" name="dob" type="date" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="phone">Phone <span className="text-gray-500 font-normal ml-1">(Opt)</span></label>
                    <input id="phone" name="phone" type="tel" placeholder="(555) 000-0000" className={inputClass} />
                  </div>
                </div>

                <hr className="dark:border-[#333537] border-gray-200 my-6" />
              </>
            )}

            {/* Core Auth Fields: Always visible */}
            <div>
              <label className={labelClass} htmlFor="identifier">{isSignUp ? 'Email' : 'Username or Email'}</label>
              <input id="identifier" name="identifier" type={isSignUp ? 'email' : 'text'} placeholder={isSignUp ? 'you@example.com' : 'username or you@example.com'} required className={inputClass} />
            </div>

            <div>
              <label className={labelClass} htmlFor="password">Password</label>
              <input id="password" name="password" type="password" placeholder="••••••••" required className={inputClass} />
            </div>
          </div>

          {/* Upgraded Primary Button */}
          <button
            formAction={isSignUp ? signup : login}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/25 mt-8 active:scale-[0.98] cursor-pointer"
          >
            {isSignUp ? 'Create Account' : 'Log In'}
          </button>

          {/* Toggle Mode Button */}
          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm dark:text-gray-400 text-gray-500 hover:text-indigo-400 transition-colors font-medium cursor-pointer"
            >
              {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
