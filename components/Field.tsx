'use client'

import { cloneElement, useId } from 'react'

// A labelled form control, in the tuimedia.nz style: the label rests inside
// the box and shrinks to the top edge once the field is focused or filled.
//
// The label must come AFTER the control in the DOM — the floating state is
// driven by :has(.field-input:focus) and :has(.field-input:not(:placeholder-shown)),
// and the second of those only works when the control carries a placeholder.
// That is why children are given `placeholder=" "` rather than left bare: an
// input with no placeholder attribute never matches :placeholder-shown, so the
// label would sit floated over an empty box forever.
export default function Field({
  label,
  hint,
  className = '',
  children,
}: {
  label: string
  /** Sits under the box. Use for format notes, not for a restatement of the label. */
  hint?: React.ReactNode
  className?: string
  /** A single input / textarea / CustomSelect / DatePicker. */
  children: React.ReactElement<{ id?: string; placeholder?: string }>
}) {
  const id = useId()
  const controlId = children.props.id ?? id

  return (
    <div className={className}>
      <div className="field">
        {/* placeholder defaults to a single space so :placeholder-shown works;
            a real placeholder passed by the caller wins and shows on focus. */}
        {cloneElement(children, {
          id: controlId,
          placeholder: children.props.placeholder ?? ' ',
        })}
        <label className="field-label" htmlFor={controlId}>{label}</label>
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}
