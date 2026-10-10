'use client'

import DocumentForm, { type ClientOption } from './DocumentForm'

export type { ClientOption }

export default function PdfGenerator({ clients, initialClientId, contractTemplate }: { clients: ClientOption[]; initialClientId?: string; contractTemplate?: string }) {
  return <DocumentForm clients={clients} mode={{ kind: 'create', initialClientId, contractTemplate }} />
}
