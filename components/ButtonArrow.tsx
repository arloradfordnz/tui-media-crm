// The arrow badge from tuimedia.nz's CTA buttons.
//
// Two identical arrows stacked in one grid cell: the first slides out right
// on hover while the second slides in from the left, so the arrow reads as
// continuously travelling rather than nudging and snapping back. The motion
// and the geometry both live in globals.css (.btn-arrow).
//
// Drop it in as the LAST child of a .btn-primary / .btn-secondary, and only
// on buttons that actually navigate — the badge means "go", so it does not
// belong on a save or submit.
export default function ButtonArrow() {
  return (
    <span className="btn-arrow" aria-hidden="true">
      <Arrow />
      <Arrow />
    </span>
  )
}

function Arrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h13M12 6l6 6-6 6" />
    </svg>
  )
}
