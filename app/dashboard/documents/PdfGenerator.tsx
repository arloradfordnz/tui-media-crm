'use client'

import DocumentForm, { type ClientOption } from './DocumentForm'

export type { ClientOption }

export default function PdfGenerator({ clients, initialClientId }: { clients: ClientOption[]; initialClientId?: string }) {
  return <DocumentForm clients={clients} mode={{ kind: 'create', initialClientId }} />
}
