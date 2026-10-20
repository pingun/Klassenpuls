import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, errorText } from '../supabase'
import { uploadImage, ACCEPT, BUCKET } from '../images'

const titleFromFile = (name) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Bild'
const parseTags = (text) => [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 20)

// Admin-Seite: Bilder für „Bild anheften“ hochladen, benennen, kategorisieren, taggen, löschen
export default function Library() {
  const [images, setImages] = useState([])
  const [err, setErr] = useState('')
  const [progress, setProgress] = useState(null)
  const [uploadCategory, setUploadCategory] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('library_images').select('*').order('created_at', { ascending: false })
    if (error) setErr(errorText(error)); else setImages(data)
  }, [])
  useEffect(() => { load() }, [load])

  const categories = useMemo(() => [...new Set(images.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')), [images])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return images.filter((i) => (!category || (category === '—' ? !i.category : i.category === category)) &&
      (!q || i.title.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q))))
  }, [images, search, category])

  async function upload(e) {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    if (!files.length) return
    setErr('')
    const failed = []
    for (const [n, file] of files.entries()) {
      setProgress(`Lade ${n + 1} von ${files.length} hoch …`)
      try {
        const img = await uploadImage(file, 'library')
        const { error } = await supabase.from('library_images').insert({
          path: img.path, url: img.url, width: img.width, height: img.height,
          title: titleFromFile(file.name), category: uploadCategory.trim() || null,
        })
        if (error) { await supabase.storage.from(BUCKET).remove([img.path]); throw error }
      } catch (e2) { failed.push(`${file.name}: ${errorText(e2)}`) }
    }
    setProgress(null)
    if (failed.length) setErr(`Nicht hochgeladen: ${failed.join(' · ')}`)
    load()
  }

  async function save(img, patch) {
    const { error } = await supabase.from('library_images').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', img.id)
    if (error) setErr(errorText(error)); else setImages((list) => list.map((i) => (i.id === img.id ? { ...i, ...patch } : i)))
  }

  async function remove(img) {
    const { data: used, error: e1 } = await supabase.rpc('image_usage_count', { p_url: img.url })
    if (e1) return setErr(errorText(e1))
    const warn = used ? `\n\nAchtung: ${used} Frage${used === 1 ? '' : 'n'} nutzt dieses Bild. Dort wird es danach nicht mehr angezeigt.` : ''
    if (!confirm(`„${img.title}“ aus der Bibliothek löschen?${warn}`)) return
    const { error } = await supabase.from('library_images').delete().eq('id', img.id)
    if (error) return setErr(errorText(error))
    await supabase.storage.from(BUCKET).remove([img.path])
    load()
  }

  return (
    <div className="container stack">
      <h1>Bildbibliothek</h1>
      <p className="muted" style={{ marginTop: -8 }}>Diese Bilder stehen allen Lehrern beim Fragetyp „Bild anheften“ zur Auswahl.</p>
      {err && <div className="alert">{err}</div>}

      <div className="card row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ minWidth: 220 }}><span>Kategorie für neue Bilder (optional)</span>
          <input type="text" list="lib-categories" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} placeholder="z. B. Erdkunde" />
        </label>
        <label className="btn mint" style={{ cursor: progress ? 'wait' : 'pointer', marginBottom: 2 }}>
          {progress || '⬆ Bilder hochladen'}
          <input type="file" accept={ACCEPT} multiple onChange={upload} disabled={!!progress} style={{ display: 'none' }} />
        </label>
        <span className="muted small grow">Mehrere Dateien auf einmal möglich. Der Dateiname wird als Name übernommen und kann danach geändert werden.</span>
      </div>
      <datalist id="lib-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="row">
        <input type="text" className="grow" style={{ width: 'auto', minWidth: 200 }} placeholder="Suchen nach Name oder Tag …" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Alle Kategorien ({images.length})</option>
          {categories.map((c) => <option key={c} value={c}>{c} ({images.filter((i) => i.category === c).length})</option>)}
          <option value="—">Ohne Kategorie</option>
        </select>
      </div>

      {!images.length && !progress && <p className="muted">Noch keine Bilder. Lade die ersten Bilder hoch.</p>}
      <div className="lib-admin-grid">
        {shown.map((img) => <ImageCard key={img.id} img={img} onSave={(patch) => save(img, patch)} onRemove={() => remove(img)} />)}
      </div>
    </div>
  )
}

function ImageCard({ img, onSave, onRemove }) {
  const [title, setTitle] = useState(img.title)
  const [cat, setCat] = useState(img.category || '')
  const [tags, setTags] = useState(img.tags.join(', '))
  useEffect(() => { setTitle(img.title); setCat(img.category || ''); setTags(img.tags.join(', ')) }, [img])

  const saveTitle = () => { const t = title.trim(); if (!t) setTitle(img.title); else if (t !== img.title) onSave({ title: t }) }
  const saveCat = () => { const c = cat.trim() || null; if (c !== img.category) onSave({ category: c }) }
  const saveTags = () => { const t = parseTags(tags); if (t.join('|') !== img.tags.join('|')) onSave({ tags: t }); setTags(t.join(', ')) }
  const enter = (e) => { if (e.key === 'Enter') e.target.blur() }

  return (
    <div className="card lib-card">
      <a href={img.url} target="_blank" rel="noreferrer" className="lib-thumb" title="In voller Größe öffnen"><img src={img.url} alt="" loading="lazy" /></a>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={enter} aria-label="Name" style={{ fontWeight: 700 }} />
      <input type="text" list="lib-categories" value={cat} onChange={(e) => setCat(e.target.value)} onBlur={saveCat} onKeyDown={enter} placeholder="Kategorie" aria-label="Kategorie" />
      <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} onBlur={saveTags} onKeyDown={enter} placeholder="Tags, mit Komma getrennt" aria-label="Tags" />
      <div className="row spread small muted">
        <span>{img.width && img.height ? `${img.width} × ${img.height} px` : ''}</span>
        <button className="btn danger small" onClick={onRemove}>Löschen</button>
      </div>
    </div>
  )
}
