import { updatePassword } from "@/app/login/actions";

export default async function ResetPasswordPage({searchParams}:{searchParams:Promise<{error?:string}>}){
  const {error}=await searchParams;
  return <main className="ava-carbon mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8 text-white">
    <h1 className="text-2xl font-bold">Choose a new password</h1>
    {error&&<p role="alert" className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-200">{error}</p>}
    <form action={updatePassword} className="mt-5 space-y-3">
      <label className="block text-sm text-[#b3bccb]">New password<input name="password" type="password" minLength={8} required autoComplete="new-password" className="mt-1 w-full rounded-lg border border-white/10 bg-[#182233] px-3 py-2 text-white"/></label>
      <button className="w-full rounded-lg bg-[#2f80ed] px-4 py-2 font-semibold">Update password</button>
    </form>
  </main>;
}
