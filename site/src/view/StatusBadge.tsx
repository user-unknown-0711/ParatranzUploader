import { STATUS_INFO } from '../review/names'
import type { Status } from '../types'

/** What the release has for a string, as colour and as text (the colour is not the only sign). */
export function StatusBadge({ status }: { status: Status }) {
  const info = STATUS_INFO[status]
  return (
    <span class={`status status-${status}`} title={info.desc}>
      {info.name}
    </span>
  )
}
