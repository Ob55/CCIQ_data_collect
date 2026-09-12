import { redirect } from 'next/navigation'

// Root simply routes to the app; middleware sends unauthenticated users to /login.
export default function Home() {
  redirect('/dashboard')
}
