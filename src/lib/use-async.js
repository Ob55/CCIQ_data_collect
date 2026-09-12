import { useEffect, useState, useCallback } from 'react'

/**
 * Run an async loader on mount (and when `deps` change), tracking loading/error/data.
 * Replaces server-component data fetching for the SPA. Returns a `reload` to refetch after
 * a mutation (the SPA equivalent of Next's revalidatePath).
 *
 * @template T
 * @param {() => Promise<T>} loader
 * @param {any[]} deps
 */
export function useAsync(loader, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const run = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loader()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Something went wrong.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(run, [run])

  const reload = useCallback(() => {
    run()
  }, [run])

  return { data, loading, error, reload }
}
