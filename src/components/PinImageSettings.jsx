import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, errorText, useIsGuest } from '../supabase'
import { uploadImage, ACCEPT, FULL } from '../images'
import CroppedImage from './CroppedImage'

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

// Bild-Einstellungen einer „Bild anheften“-Frage: Bild wählen/hochladen, Ausschnitt, Breite auf dem Handy
export default function PinImageSettings({ settings, onChange }) {
  const [picker, setPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (patch) => onChange({ ...settings, ...patch })
  const guest = useIsGuest() // Gäste nutzen nur die Bildbibliothek

  function applyImage({ url, path = null, width, height, libraryId = null }) {
    set({ image_url: url, image_path: path, image_w: width || null, image_h: height || null, library_id: libraryId, crop: null })
  }

  async function upload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      applyImage(await uploadImage(file, session.user.id))
    } catch (e2) { setErr(errorText(e2)) } finally { setBusy(false) }
  }

  return (
    <div className="stack pin-settings">
      <div className="row">
        <button type="button" className="btn sky" onClick={() => setPicker(true)}>🖼 Aus Bildbibliothek wählen</button>
        {!guest && (
          <label className="btn ghost" style={{ cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Lade hoch …' : '⬆ Eigenes Bild hochladen'}
            <input type="file" accept={ACCEPT} onChange={upload} disabled={busy} style={{ display: 'none' }} />
          </label>
        )}
      </div>
      {err && <div className="alert">{err}</div>}
      {!settings.image_url && <span className="muted small">{guest ? 'Wähle ein Bild aus der Bibliothek (z. B. Karte, Diagramm, Abbildung). Eigene Bilder hochladen können nur angemeldete Lehrer.' : 'Wähle ein Bild aus der Bibliothek oder lade ein eigenes hoch (z. B. Karte, Diagramm, Abbildung). Große Fotos werden automatisch verkleinert.'}</span>}

      {settings.image_url && (
        <div className="pin-config">
          <CropEditor url={settings.image_url} dims={{ w: settings.image_w, h: settings.image_h }}
            crop={settings.crop} onChange={(crop) => set({ crop })} />
          <WidthSetting settings={settings} onChange={(student_width) => set({ student_width })} />
        </div>
      )}

      {picker && <LibraryPicker onClose={() => setPicker(false)} onPick={(img) => { applyImage({ url: img.url, width: img.width, height: img.height, libraryId: img.id }); setPicker(false) }} />}
    </div>
  )
}

// Zoom-Regler + Verschieben per Maus/Finger. Der Ausschnitt behält das Seitenverhältnis des Bildes.
function CropEditor({ url, dims, crop, onChange }) {
  const c = crop || FULL
  const zoom = 1 / c.w
  const frame = useRef(null)
  const drag = useRef(null)

  function setZoom(z) {
    const w = 1 / z
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2
    const next = { w, h: w, x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - w / 2, 0, 1 - w) }
    onChange(z <= 1.001 ? null : next)
  }

  function down(e) {
    if (zoom <= 1.001) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, x: c.x, y: c.y }
  }
  function move(e) {
    const d = drag.current
    if (!d) return
    const r = frame.current.getBoundingClientRect()
    const x = clamp(d.x - ((e.clientX - d.px) / r.width) * c.w, 0, 1 - c.w)
    const y = clamp(d.y - ((e.clientY - d.py) / r.height) * c.h, 0, 1 - c.h)
    onChange({ ...c, x, y })
  }
  const up = () => { drag.current = null }

  return (
    <div className="stack" style={{ minWidth: 0 }}>
      <b className="small">Ausschnitt (so sehen es Beamer und Schüler)</b>
      <CroppedImage url={url} dims={dims} crop={crop} maxHeight="300px" className="crop-frame"
        ref={frame} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ cursor: zoom > 1.001 ? 'grab' : 'default', touchAction: 'none' }} />
      <div className="row small" style={{ gap: 10 }}>
        <span>🔍</span>
        <input type="range" min="1" max="5" step="0.05" value={zoom} onChange={(e) => setZoom(+e.target.value)} style={{ flex: 1, minWidth: 140 }} aria-label="Zoom" />
        <span style={{ width: 46, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(zoom * 100)} %</span>
        <button type="button" className="btn ghost small" onClick={() => onChange(null)} disabled={!crop}>Ganzes Bild</button>
      </div>
      {zoom > 1.001 && (
        <div className="row small muted" style={{ gap: 10 }}>
          <div className="crop-overview">
            <CroppedImage url={url} dims={dims} />
            <span style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }} />
          </div>
          <span>Ziehe das Bild oben mit der Maus, um den Ausschnitt zu verschieben.</span>
        </div>
      )}
    </div>
  )
}

function WidthSetting({ settings, onChange }) {
  const width = settings.student_width || 100
  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <b className="small">Bildbreite auf dem Schülerhandy</b>
      <div className="phone-mock">
        <div className="phone-q" />
        <div style={{ width: `${width}%`, margin: '0 auto' }}>
          <CroppedImage url={settings.image_url} dims={{ w: settings.image_w, h: settings.image_h }} crop={settings.crop} className="pin-input" />
        </div>
        <div className="phone-btn" />
      </div>
      <div className="row small" style={{ gap: 8, width: 190 }}>
        <input type="range" min="30" max="100" step="5" value={width} onChange={(e) => onChange(+e.target.value === 100 ? null : +e.target.value)} style={{ flex: 1 }} aria-label="Bildbreite" />
        <span style={{ width: 40, textAlign: 'right' }}>{width} %</span>
      </div>
    </div>
  )
}

// Auswahlfenster für die Bildbibliothek mit Suche, Kategorien und großer Vorschau
export function LibraryPicker({ onClose, onPick }) {
  const [images, setImages] = useState(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    supabase.from('library_images').select('*').order('category', { nullsFirst: false }).order('title')
      .then(({ data }) => setImages(data || []))
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const categories = useMemo(() => [...new Set((images || []).map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')), [images])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (images || []).filter((i) => (!category || i.category === category) &&
      (!q || i.title.toLowerCase().includes(q) || (i.category || '').toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q))))
  }, [images, search, category])

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card library-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row spread">
          <h2 style={{ margin: 0 }}>Bildbibliothek</h2>
          <button className="btn ghost small" onClick={onClose}>Schließen</button>
        </div>
        <div className="row">
          <input type="text" className="grow" style={{ width: 'auto' }} placeholder="Suchen nach Name, Kategorie oder Tag …" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>
        {categories.length > 0 && (
          <div className="chips">
            <button className={!category ? 'on' : ''} onClick={() => setCategory('')}>Alle</button>
            {categories.map((c) => <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>{c}</button>)}
          </div>
        )}
        <div className="library-body">
          <div className="library-grid">
            {images === null && <p className="muted">Lade …</p>}
            {images?.length === 0 && <p className="muted">Die Bibliothek ist noch leer. Ein Admin kann unter „Verwaltung → Bildbibliothek“ Bilder hinzufügen.</p>}
            {images?.length > 0 && !shown.length && <p className="muted">Keine Bilder gefunden.</p>}
            {shown.map((img) => (
              <button key={img.id} className={`library-tile ${selected?.id === img.id ? 'on' : ''}`} onClick={() => setSelected(img)} onDoubleClick={() => onPick(img)}>
                <img src={img.url} alt="" loading="lazy" />
                <span>{img.title}</span>
              </button>
            ))}
          </div>
          <div className="library-preview">
            {selected ? (
              <>
                <img src={selected.url} alt={selected.title} />
                <b>{selected.title}</b>
                {selected.category && <span className="small muted">Kategorie: {selected.category}</span>}
                {selected.tags.length > 0 && <div className="chips small">{selected.tags.map((t) => <span key={t} className="pill">{t}</span>)}</div>}
                <button className="btn mint" onClick={() => onPick(selected)}>Dieses Bild verwenden</button>
              </>
            ) : <p className="muted small">Klicke auf ein Bild, um es groß zu sehen. Doppelklick übernimmt es direkt.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
