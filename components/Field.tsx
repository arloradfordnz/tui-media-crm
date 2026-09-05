'use client'

import { cloneElement, useCallback, useId, useLayoutEffect, useRef } from 'react'

// A labelled form control in the tuimedia.nz style: the label rests inside the
// box and lifts into its top edge, in accent, on focus or once there is a
// value. The geometry and the motion are ported from the rebrand wireframe —
// see the .field block in globals.css for why the lift is a single transform.
//
// The label is rendered AFTER the control on purpose. It is absolutely
// positioned so visual order does not move, and the sibling selectors that
// drive the lift can only read the control's state from that direction.
export default function Field({
  label,
  hint,
  action,
  className = '',
  children,
}: {
  label: string
  /** Sits under the box. For a format note, not a restatement of the label. */
  hint?: React.ReactNode
  /** An icon button tucked into the bottom-right corner, inside the box. */
  action?: React.ReactNode
  className?: string
  /** A single input / textarea / select / CustomSelect / DatePicker. */
  children: React.ReactElement<{ id?: string; placeholder?: string }>
}) {
  const id = useId()
  const controlId = children.props.id ?? id
  const wrapRef = useRef<HTMLDivElement>(null)

  // Textareas grow to their content instead of scrolling at a fixed height —
  // the box should fit what is in it. It still scrolls once it hits the max
  // height set in CSS, so a very long document body does not push the buttons
  // off the bottom of the page.
  const grow = useCallback(() => {
    const el = wrapRef.current?.querySelector('textarea')
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  // Layout effect rather than effect: the resize has to happen before paint or
  // the box visibly jumps from its default rows to its real height on load.
  useLayoutEffect(() => {
    grow()
    const el = wrapRef.current?.querySelector('textarea')
    if (!el) return
    el.addEventListener('input', grow)
    return () => el.removeEventListener('input', grow)
  })

  return (
    <div className={className}>
      <div className="field" ref={wrapRef}>
        {/* placeholder defaults to a single space so :placeholder-shown can
            tell empty from filled; a real placeholder passed by the caller
            wins and shows on focus. */}
        {cloneElement(children, {
          id: controlId,
          placeholder: children.props.placeholder ?? ' ',
        })}
        <label className="field-label" htmlFor={controlId}>{label}</label>
        {action}
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}
