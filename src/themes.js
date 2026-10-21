import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Alle Stile der App. Jeder Stil setzt dieselben CSS-Variablen; Komponenten nutzen nur diese Variablen.
// c1–c8: helle Flächen für Diagramme, Antwortknöpfe und Notizzettel (Text darauf: chartInk)
// s1–s8: kräftige Farben für Linien, Punkte und Wortwolke
const SANS = "'Source Sans 3', 'Scala Sans', system-ui, sans-serif"
const SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif"

export const THEMES = [
  {
    key: 'klassik', name: 'Schul-Klassik', desc: 'Weinrot und Petrol, helle Diagrammfarben',
    v: {
      bg: '#f7f5f5', glow1: '#f6e9eb', glow2: '#e6efed', card: '#ffffff', field: '#ffffff', muted: '#eeeeee',
      ink: '#2d2e33', inkSoft: '#6c6d74', line: '#e6e0e1',
      brand: '#942838', brandDeep: '#7a1f2e', brandTint: '#dfbfc3', brandSoft: '#f5e8ea', onBrand: '#ffffff',
      accent: '#11443e', accentTint: '#b5d0cb', accentSoft: '#e3eeec', onAccent: '#ffffff',
      topbar: '#942838', topbarInk: '#ffffff', infoBg: '#eef4f8', infoInk: '#2f5a78', chartInk: '#2d2e33',
      c: ['#dfbfc3', '#b5d0cb', '#f4d3a8', '#b9d6ea', '#e6e9a6', '#d5c3d6', '#c9ddb4', '#e8dccf'],
      s: ['#942838', '#11443e', '#b35c1e', '#2f6f99', '#6b7a10', '#7a4d7a', '#4f6d2f', '#8a6a3d'],
      font: SANS, heading: SANS, scheme: 'light',
    },
  },
  {
    key: 'nordisch', name: 'Nordisch', desc: 'Stahlblau mit warmem Senf-Akzent',
    v: {
      bg: '#eef2f6', glow1: '#e1e9f2', glow2: '#f3ece0', card: '#ffffff', field: '#ffffff', muted: '#e3e8ee',
      ink: '#1f2d3d', inkSoft: '#5b6b7c', line: '#d9e1ea',
      brand: '#2f5d8a', brandDeep: '#234769', brandTint: '#b9cde2', brandSoft: '#e6eef6', onBrand: '#ffffff',
      accent: '#2b4560', accentTint: '#c5d3e0', accentSoft: '#e8eef4', onAccent: '#ffffff',
      topbar: '#2f5d8a', topbarInk: '#ffffff', infoBg: '#e6eef6', infoInk: '#234769', chartInk: '#1f2d3d',
      c: ['#a9c6e0', '#e3c48f', '#c7d6e4', '#8fb0cf', '#d9b77a', '#b8c9d9', '#a7bfb7', '#d6cbbd'],
      s: ['#2f5d8a', '#b07d2c', '#4a7aa8', '#1f2d3d', '#6f9cc7', '#8a6a3d', '#3b6e6a', '#5b6b7c'],
      font: SANS, heading: SANS, scheme: 'light',
    },
  },
  {
    key: 'wald', name: 'Waldgrün', desc: 'Dunkelgrün und Salbei mit Ocker',
    v: {
      bg: '#f4f1e8', glow1: '#e7eee3', glow2: '#f3e8d2', card: '#fbfaf5', field: '#ffffff', muted: '#e8e4d8',
      ink: '#24342a', inkSoft: '#5d6b60', line: '#dfdacb',
      brand: '#2d5a3d', brandDeep: '#21452e', brandTint: '#b9cfbd', brandSoft: '#e6efe6', onBrand: '#ffffff',
      accent: '#8a5f1f', accentTint: '#e3cfa6', accentSoft: '#f4ead6', onAccent: '#ffffff',
      topbar: '#2d5a3d', topbarInk: '#ffffff', infoBg: '#e6efe6', infoInk: '#21452e', chartInk: '#24342a',
      c: ['#9cbf9f', '#e3c48f', '#c7dbc5', '#b8c98f', '#d9b98a', '#a9c4b0', '#e6d8b5', '#c2b8a3'],
      s: ['#2d5a3d', '#c8963e', '#5f8b6b', '#8a5f1f', '#6b7f3a', '#3d6b5f', '#a8743a', '#4f5d52'],
      font: SANS, heading: SANS, scheme: 'light',
    },
  },
  {
    key: 'graphit', name: 'Graphit dunkel', desc: 'Dunkler Hintergrund, klare Farben – blendet am Beamer weniger',
    v: {
      bg: '#1e2126', glow1: '#24302f', glow2: '#2b2a22', card: '#2a2e35', field: '#22262c', muted: '#353a42',
      ink: '#eef0f3', inkSoft: '#9aa3ad', line: '#3b4048',
      brand: '#4fb3a9', brandDeep: '#8ad6cd', brandTint: '#2f5c58', brandSoft: '#263b3a', onBrand: '#10201e',
      accent: '#f2c14e', accentTint: '#5a4d2a', accentSoft: '#3a3426', onAccent: '#2a2209',
      topbar: '#2a2e35', topbarInk: '#eef0f3', infoBg: '#26323f', infoInk: '#a9c8ef', chartInk: '#15181c',
      c: ['#4fb3a9', '#f2c14e', '#e07a5f', '#8ab4f8', '#b9a3e3', '#9ccc65', '#f49ac1', '#cfd8dc'],
      s: ['#4fb3a9', '#f2c14e', '#e07a5f', '#8ab4f8', '#b9a3e3', '#9ccc65', '#f49ac1', '#cfd8dc'],
      font: SANS, heading: SANS, scheme: 'dark',
    },
  },
  {
    key: 'akademie', name: 'Akademie-Blau', desc: 'Tiefes Blau, Überschriften mit Serifen',
    v: {
      bg: '#f5f7fb', glow1: '#e6edf7', glow2: '#f6e8ea', card: '#ffffff', field: '#ffffff', muted: '#e7ebf2',
      ink: '#14213d', inkSoft: '#55627a', line: '#dde3ec',
      brand: '#1d4e89', brandDeep: '#163b68', brandTint: '#b6cbe6', brandSoft: '#e7eef8', onBrand: '#ffffff',
      accent: '#b23a48', accentTint: '#ebbcc2', accentSoft: '#f8e8ea', onAccent: '#ffffff',
      topbar: '#1d4e89', topbarInk: '#ffffff', infoBg: '#e7eef8', infoInk: '#163b68', chartInk: '#14213d',
      c: ['#b6cbe6', '#ebbcc2', '#cfdcef', '#9fb9dc', '#e2c9a0', '#c5cfdf', '#b9d3cf', '#ddd2e6'],
      s: ['#1d4e89', '#b23a48', '#3f7cc0', '#14213d', '#8a6a3d', '#2f6f6a', '#6a4c93', '#55627a'],
      font: SANS, heading: SERIF, scheme: 'light',
    },
  },
  {
    key: 'terrakotta', name: 'Terrakotta', desc: 'Warmes Rotbraun, Olive und Schiefer',
    v: {
      bg: '#f6efe6', glow1: '#f3e0d6', glow2: '#e8ead9', card: '#fdf9f4', field: '#ffffff', muted: '#ece3d7',
      ink: '#3d2b24', inkSoft: '#7a6458', line: '#e6dacb',
      brand: '#b5543c', brandDeep: '#8f3f2b', brandTint: '#ebc3b3', brandSoft: '#f7e6dd', onBrand: '#ffffff',
      accent: '#3d405b', accentTint: '#c3c5d8', accentSoft: '#e8e9f0', onAccent: '#ffffff',
      topbar: '#b5543c', topbarInk: '#ffffff', infoBg: '#e8e9f0', infoInk: '#3d405b', chartInk: '#3d2b24',
      c: ['#ebc3b3', '#c3c5d8', '#e6c9a0', '#c9d0a8', '#d9a993', '#d8cfc2', '#b9c4cf', '#e3d3b3'],
      s: ['#b5543c', '#3d405b', '#6b7f3a', '#d99a6c', '#8f3f2b', '#5b6b7c', '#a8743a', '#7a6458'],
      font: SANS, heading: SANS, scheme: 'light',
    },
  },
  {
    key: 'pflaume', name: 'Pflaume und Salbei', desc: 'Gedämpftes Violett mit Salbei und Altrosa',
    v: {
      bg: '#faf7f2', glow1: '#f1e6ef', glow2: '#e9efe2', card: '#ffffff', field: '#ffffff', muted: '#eee8ea',
      ink: '#3b2a3a', inkSoft: '#76626f', line: '#e8dfe4',
      brand: '#5b3758', brandDeep: '#472a45', brandTint: '#d2bccf', brandSoft: '#f2eaf0', onBrand: '#ffffff',
      accent: '#5f7a4a', accentTint: '#c9d7bb', accentSoft: '#edf2e6', onAccent: '#ffffff',
      topbar: '#5b3758', topbarInk: '#ffffff', infoBg: '#edf2e6', infoInk: '#455a35', chartInk: '#3b2a3a',
      c: ['#d2bccf', '#c9d7bb', '#e8c9c9', '#c6b3d1', '#dcd3b8', '#b9cfc7', '#e3cfd9', '#d6d0c4'],
      s: ['#5b3758', '#5f7a4a', '#9b6b8e', '#b0706f', '#7a6a3d', '#3f6b66', '#8a5a7a', '#76626f'],
      font: SANS, heading: SANS, scheme: 'light',
    },
  },
  {
    key: 'kontrast', name: 'Hoher Kontrast', desc: 'Barrierearm, auch bei Rot-Grün-Schwäche unterscheidbar',
    v: {
      bg: '#ffffff', glow1: '#ffffff', glow2: '#ffffff', card: '#ffffff', field: '#ffffff', muted: '#e8e8e8',
      ink: '#000000', inkSoft: '#333333', line: '#8a8a8a',
      brand: '#0047ab', brandDeep: '#00316f', brandTint: '#9db8e0', brandSoft: '#e6eef9', onBrand: '#ffffff',
      accent: '#000000', accentTint: '#bdbdbd', accentSoft: '#eeeeee', onAccent: '#ffffff',
      topbar: '#0047ab', topbarInk: '#ffffff', infoBg: '#e6eef9', infoInk: '#00316f', chartInk: '#000000',
      c: ['#56b4e9', '#e69f00', '#009e73', '#f0e442', '#cc79a7', '#9ad0f5', '#d55e00', '#bbbbbb'],
      s: ['#0047ab', '#e69f00', '#009e73', '#cc79a7', '#d55e00', '#0072b2', '#000000', '#555555'],
      font: SANS, heading: SANS, scheme: 'light',
    },
  },
]

export const DEFAULT_THEME = 'klassik'
export const themeByKey = (key) => THEMES.find((t) => t.key === key) || THEMES[0]

const VAR_NAMES = {
  bg: '--bg', glow1: '--bg-glow-1', glow2: '--bg-glow-2', card: '--card', field: '--field', muted: '--muted-bg',
  ink: '--ink', inkSoft: '--ink-soft', line: '--line',
  brand: '--brand', brandDeep: '--brand-deep', brandTint: '--brand-tint', brandSoft: '--brand-soft', onBrand: '--on-brand',
  accent: '--accent', accentTint: '--accent-tint', accentSoft: '--accent-soft', onAccent: '--on-accent',
  topbar: '--topbar-bg', topbarInk: '--topbar-ink', infoBg: '--info-bg', infoInk: '--info-ink', chartInk: '--chart-ink',
  font: '--font', heading: '--heading-font',
}

// lesbare Schriftfarbe (dunkel oder weiß) auf einer Hintergrundfarbe
export function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  const dark = (L + 0.05) / (0.0086 + 0.05) // Kontrast zu #15181c
  const white = 1.05 / (L + 0.05)
  return dark >= white ? '#15181c' : '#ffffff'
}

export function applyTheme(key) {
  const t = themeByKey(key)
  const root = document.documentElement
  for (const [k, name] of Object.entries(VAR_NAMES)) root.style.setProperty(name, t.v[k])
  t.v.c.forEach((c, i) => root.style.setProperty(`--c${i + 1}`, c))
  t.v.s.forEach((c, i) => {
    root.style.setProperty(`--s${i + 1}`, c)
    root.style.setProperty(`--s${i + 1}-ink`, inkOn(c))
  })
  root.style.colorScheme = t.v.scheme
  root.dataset.theme = t.key
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.v.topbar)
}

// ---- Schulstandard (vom Admin festgelegt) ----
const SCHOOL_EVENT = 'klassenpuls:school-theme'
let schoolPromise = null
function loadSchoolTheme(force = false) {
  if (!schoolPromise || force) {
    schoolPromise = supabase.rpc('school_theme').then(({ data }) => data || null, () => null)
  }
  return schoolPromise
}
// nach einer Änderung durch den Admin alle Seiten neu einfärben
export function notifySchoolThemeChanged() {
  loadSchoolTheme(true)
  window.dispatchEvent(new Event(SCHOOL_EVENT))
}

export function useSchoolTheme() {
  const [school, setSchool] = useState(null)
  useEffect(() => {
    let alive = true
    const load = (force) => loadSchoolTheme(force).then((t) => { if (alive) setSchool(t) })
    load(false)
    const onChange = () => load(false)
    window.addEventListener(SCHOOL_EVENT, onChange)
    return () => { alive = false; window.removeEventListener(SCHOOL_EVENT, onChange) }
  }, [])
  return school
}

// Stil für die aktuelle Seite setzen: angegebener Stil, sonst Schulstandard, sonst Schul-Klassik
export function useTheme(key) {
  const school = useSchoolTheme()
  const effective = key || school || DEFAULT_THEME
  useEffect(() => { applyTheme(effective) }, [effective])
  return effective
}
