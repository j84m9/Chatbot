import { login, signup } from './actions'

export default function LoginPage() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#131314] text-gray-100 font-sans">
      <form className="flex flex-col w-full max-w-sm gap-4 bg-[#1e1f20] p-8 rounded-xl border border-[#333537] shadow-xl">
        <h1 className="text-2xl font-medium text-center mb-6">Welcome to Llama Chat</h1>
        
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-400 font-medium" htmlFor="email">Email</label>
          <input 
            id="email" 
            name="email" 
            type="email" 
            required 
            className="p-3 rounded-lg bg-[#131314] text-white border border-[#333537] focus:outline-none focus:border-gray-500 transition-colors" 
          />
        </div>
        
        <div className="flex flex-col gap-2 mt-2">
          <label className="text-sm text-gray-400 font-medium" htmlFor="password">Password</label>
          <input 
            id="password" 
            name="password" 
            type="password" 
            required 
            className="p-3 rounded-lg bg-[#131314] text-white border border-[#333537] focus:outline-none focus:border-gray-500 transition-colors" 
          />
        </div>
        
        <div className="flex gap-4 mt-8">
          <button formAction={login} className="flex-1 bg-[#333537] hover:bg-[#4a4d51] text-white py-3 rounded-lg font-medium transition-colors">
            Log In
          </button>
          <button formAction={signup} className="flex-1 bg-transparent hover:bg-[#333537] border border-[#333537] text-white py-3 rounded-lg font-medium transition-colors">
            Sign Up
          </button>
        </div>
      </form>
    </div>
  )
}