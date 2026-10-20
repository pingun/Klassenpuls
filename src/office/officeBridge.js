/* global Office */
// Schmale Schicht über Office.js. Außerhalb von PowerPoint (normaler Browser) gibt es Ersatzwerte,
// damit sich die Oberfläche auch ohne PowerPoint testen lässt:
//   office.html?view=read   → simuliert die Bildschirmpräsentation
//   office.html?slide=…     → simuliert die Folien-ID

const params = new URLSearchParams(window.location.search)
const DEV_KEY = 'klassenpuls.office.dev-settings'

export const inOffice = () => typeof Office !== 'undefined' && !!Office.context?.document

export function officeReady() {
  if (typeof Office === 'undefined' || !Office.onReady) return Promise.resolve({ host: null })
  return Office.onReady()
}

// ---- Einstellungen dieses Add-ins auf dieser Folie (werden in der .pptx gespeichert)
export function loadConfig() {
  if (inOffice()) return Office.context.document.settings.get('klassenpuls') || null
  try { return JSON.parse(localStorage.getItem(DEV_KEY)) } catch { return null }
}

export function saveConfig(config) {
  if (!inOffice()) {
    localStorage.setItem(DEV_KEY, JSON.stringify(config))
    return Promise.resolve()
  }
  Office.context.document.settings.set('klassenpuls', config)
  return new Promise((resolve, reject) => {
    Office.context.document.settings.saveAsync((r) => (r.status === Office.AsyncResultStatus.Succeeded ? resolve() : reject(r.error)))
  })
}

// ---- Ansicht: 'edit' (Bearbeiten) oder 'read' (Bildschirmpräsentation)
export function getActiveView() {
  if (!inOffice() || !Office.context.document.getActiveViewAsync) return Promise.resolve(params.get('view') === 'read' ? 'read' : 'edit')
  return new Promise((resolve) => Office.context.document.getActiveViewAsync((r) => resolve(r.status === 'succeeded' ? r.value : 'edit')))
}

export function onActiveViewChanged(handler) {
  if (!inOffice() || !Office.EventType?.ActiveViewChanged) return () => {}
  const fn = (e) => handler(e.activeView)
  Office.context.document.addHandlerAsync(Office.EventType.ActiveViewChanged, fn)
  return () => Office.context.document.removeHandlerAsync(Office.EventType.ActiveViewChanged, { handler: fn })
}

// ---- Aktuell gezeigte Folie (ID) – in der Präsentation die gerade sichtbare Folie, sonst die ausgewählte.
// Liefert null, wenn PowerPoint die Abfrage nicht unterstützt.
export function getCurrentSlideId() {
  if (!inOffice()) return Promise.resolve(params.get('slide') || 'dev-slide')
  return new Promise((resolve) => {
    try {
      Office.context.document.getSelectedDataAsync(Office.CoercionType.SlideRange, (r) => {
        const slide = r.status === Office.AsyncResultStatus.Succeeded ? r.value?.slides?.[0] : null
        resolve(slide ? String(slide.id) : null)
      })
    } catch { resolve(null) }
  })
}
