import { supabase } from './supabase'

export const BUCKET = 'question-images'
export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
}

// Bild verkleinern (max. 1600 px), damit es auf Schülerhandys schnell lädt; liefert auch die Maße
export async function prepareImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') throw new Error('Bitte eine Bilddatei (JPG, PNG, WebP oder GIF) wählen.')
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const w = img.naturalWidth, h = img.naturalHeight
    if (file.type === 'image/gif') return { blob: file, ext: 'gif', width: w, height: h }
    const max = 1600
    const scale = Math.min(1, max / Math.max(w, h))
    if (scale === 1 && file.size < 1_500_000 && ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      return { blob: file, ext: file.type.split('/')[1].replace('jpeg', 'jpg'), width: w, height: h }
    }
    const c = document.createElement('canvas')
    c.width = Math.round(w * scale); c.height = Math.round(h * scale)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85))
    return { blob, ext: 'jpg', width: c.width, height: c.height }
  } finally { URL.revokeObjectURL(url) }
}

// Lädt eine Datei in den Ordner `folder` hoch und gibt URL, Pfad und Maße zurück
export async function uploadImage(file, folder) {
  const { blob, ext, width, height } = await prepareImage(file)
  if (blob.size > 5 * 1024 * 1024) throw new Error('Das Bild ist zu groß (max. 5 MB).')
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || `image/${ext}`, cacheControl: '31536000' })
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, path, width, height }
}

export const FULL = { x: 0, y: 0, w: 1, h: 1 }
