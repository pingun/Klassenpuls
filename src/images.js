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

// ---------- Logos ----------
// Logos liegen in einem eigenen Speicher (nur Admins schreiben; dort ist auch SVG erlaubt).
export const LOGO_BUCKET = 'logos'
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,.svg'
// ältere Logos lagen im Fragebild-Speicher unter "logos/…"
export const logoBucketFor = (path) => (path.startsWith('logos/') ? BUCKET : LOGO_BUCKET)

const isSvg = (file) => file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)

// SVG bereinigen: Skripte, Event-Handler und externe Verweise entfernen; Größe aus viewBox ergänzen
export async function sanitizeSvg(file) {
  const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml')
  const svg = doc.documentElement
  if (doc.getElementsByTagName('parsererror').length || svg.nodeName.toLowerCase() !== 'svg') throw new Error('Die SVG-Datei ist ungültig.')
  for (const tag of ['script', 'foreignObject', 'iframe', 'object', 'embed', 'audio', 'video']) {
    [...doc.getElementsByTagName(tag)].forEach((el) => el.remove())
  }
  const safeRef = (v) => v.startsWith('#') || /^data:image\/(png|jpe?g|webp|gif);/.test(v)
  for (const el of [svg, ...svg.getElementsByTagName('*')]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      if (name.startsWith('on') || value.includes('javascript:') || ((name === 'href' || name.endsWith(':href')) && !safeRef(value))) {
        el.removeAttribute(attr.name)
      }
    }
  }
  for (const style of doc.getElementsByTagName('style')) style.textContent = style.textContent.replace(/@import[^;]*;?/gi, '')

  // feste Größe setzen, damit das Logo in <img> nicht auf 0 Pixel zusammenfällt
  const dim = (v) => (v && !v.trim().endsWith('%') ? parseFloat(v) : NaN)
  let width = dim(svg.getAttribute('width')), height = dim(svg.getAttribute('height'))
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
  if (!(width > 0 && height > 0) && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    width = vb[2]; height = vb[3]
    svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height))
  }
  if (!(width > 0 && height > 0)) throw new Error('Die SVG-Datei hat weder Breite/Höhe noch eine viewBox.')
  const text = new XMLSerializer().serializeToString(doc)
  return { blob: new Blob([text], { type: 'image/svg+xml' }), ext: 'svg', width: Math.round(width), height: Math.round(height) }
}

// Rastergrafiken: Transparenz erhalten, nur sehr große Dateien auf max. 800 px verkleinern
async function prepareRasterLogo(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Bitte ein Logo als SVG, PNG, JPG oder WebP wählen.')
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    let blob = file, width = img.naturalWidth, height = img.naturalHeight
    const max = 800
    if (Math.max(width, height) > max || file.size > 1_000_000) {
      const scale = Math.min(1, max / Math.max(width, height))
      const c = document.createElement('canvas')
      c.width = Math.round(width * scale); c.height = Math.round(height * scale)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
      blob = await new Promise((res) => c.toBlob(res, type, 0.9))
      width = c.width; height = c.height
    }
    return { blob, ext: blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1], width, height }
  } finally { URL.revokeObjectURL(url) }
}

export async function uploadLogo(file) {
  const { blob, ext, width, height } = isSvg(file) ? await sanitizeSvg(file) : await prepareRasterLogo(file)
  if (blob.size > 2 * 1024 * 1024) throw new Error('Das Logo ist zu groß (max. 2 MB).')
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })
  if (error) throw error
  return { url: supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl, path, width, height }
}
