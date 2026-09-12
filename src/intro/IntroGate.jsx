import { useEffect, useState } from 'react'

// Brand intro splash. Plays once per session, on desktop only, before the app is used.
// The animation lives in /public/intro.html (self-contained canvas + Web Audio); we overlay
// it in a fixed iframe and remove it when it posts 'cleancookiq:ready'. The app renders
// behind it, so auth/routing is ready the moment the splash clears.
const SESSION_KEY = 'ccIntroSeen'

function shouldPlay() {
  try {
    if (sessionStorage.getItem(SESSION_KEY) === '1') return false
  } catch {
    /* private mode — just play */
  }
  // Desktop only.
  return typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
}

export function IntroGate({ children }) {
  const [playing, setPlaying] = useState(() => shouldPlay())

  useEffect(() => {
    if (!playing) return
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      /* ignore */
    }
    const onMessage = (e) => {
      if (e.data === 'cleancookiq:ready') setPlaying(false)
    }
    window.addEventListener('message', onMessage)
    // Safety net: never trap the user behind the splash if the signal is missed.
    const timer = setTimeout(() => setPlaying(false), 12000)
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
