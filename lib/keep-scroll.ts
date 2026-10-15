// The dashboard scrolls inside its main panel, not the window. A save re-renders
// the page from the server, and when that swaps content the panel can land back
// at the top. Call this before the save and the returned function after it: it
// puts the panel back where it was, over a few frames so it wins against the
// re-render.
export function keepScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.scroll-invisible'))
  const el = panels[panels.length - 1] ?? null
  const top = el ? el.scrollTop : window.scrollY
  return () => {
    let n = 0
    const put = () => {
      if (el) el.scrollTop = top
      else window.scrollTo({ top })
      if (++n < 12) requestAnimationFrame(put)
    }
    put()
  }
}
