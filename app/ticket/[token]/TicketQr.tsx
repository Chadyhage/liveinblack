'use client'

import { QRCodeSVG } from 'qrcode.react'

export default function TicketQr({ url }: { url: string }) {
  return <QRCodeSVG value={url} size={168} level="H" role="img" aria-label="Code QR du billet, à scanner à l'entrée" />
}
