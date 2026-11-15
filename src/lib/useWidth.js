import { useEffect, useRef, useState } from 'react'

/** Measure an element's width so SVG charts can be drawn 1:1 in CSS pixels (readable text on phones). */
export function useWidth(initial = 920) {
  const ref = useRef(null)
  const [w, setW] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => { const x = Math.round(el.getBoundingClientRect().width); if (x > 0) setW(x) }
    read()
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', read); return () => window.removeEventListener('resize', read) }
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}
