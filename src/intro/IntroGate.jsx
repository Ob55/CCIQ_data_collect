import { useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'

// Brand intro splash. Plays on desktop whenever the user is NOT signed in (i.e. on the
// login page), including on every refresh of that page. It does not play for signed-in
// users. The animation lives in /public/intro.html (self-contained canvas + Web Audio);
// we overlay it in a fixed iframe and remove it when it posts 'cleancookiq:ready'.
function isDesktop() {
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
}

export function IntroGate({ children }) {
  const { session, loading } = useAuth()
  const [desktop] = useState(isDesktop)
  const [dismissed, setDismissed] = useState(false)

  // Only once auth is resolved and there's no session (logged out). A refresh remounts this
  // component, so `dismissed` resets and the intro plays again on the login page.
  const playing = desktop && !loading && !session && !dismissed

  useEffect(() => {
    if (!playing) return
    const onMessage = (e) => {
      if (e.data === 'cleancookiq:ready') setDismissed(true)
    }
    window.addEventListener('message', onMessage)
    // Safety net: never trap the user behind the splash if the signal is missed.
    const timer = setTimeout(() => setDismissed(true), 12000)
    return () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
    }
  }, [playing])

  return (
    <>
      {children}
      {playing ? (
        <iframe
          title="cleancookiq"
          src="/intro.html"
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            width: '100%',
            height: '100%',
            border: 0,
            zIndex: 9999,
          }}
        />
      ) : null}
    </>
  )
}
