import { forwardRef, useEffect, useState } from 'react'
import { FULL } from '../images'

// Zeigt den Ausschnitt `crop` (Anteile 0..1) eines Bildes; Kinder (z. B. Pins) liegen darüber.
// maxHeight begrenzt die Höhe (CSS-Wert), die Breite ergibt sich aus dem Seitenverhältnis.
const CroppedImage = forwardRef(function CroppedImage({ url, crop, dims, maxHeight, className = '', style, children, ...rest }, ref) {
  const [nat, setNat] = useState(dims?.w ? dims : null)
  useEffect(() => {
    if (dims?.w && dims?.h) { setNat(dims); return }
    let alive = true
    const i = new Image()
    i.onload = () => { if (alive) setNat({ w: i.naturalWidth, h: i.naturalHeight }) }
    i.src = url
    return () => { alive = false }
  }, [url, dims?.w, dims?.h])

  const c = crop || FULL
  const ratio = nat ? (nat.w * c.w) / (nat.h * c.h) : 4 / 3
  return (
    <div ref={ref} className={`cropped ${className}`} {...rest}
      style={{ aspectRatio: ratio, width: maxHeight ? `min(100%, calc(${maxHeight} * ${ratio}))` : '100%', ...style }}>
      <img src={url} alt="" draggable="false" className="crop-img"
        style={{ width: `${100 / c.w}%`, height: `${100 / c.h}%`, left: `${(-c.x / c.w) * 100}%`, top: `${(-c.y / c.h) * 100}%` }} />
      {children}
    </div>
  )
})

export default CroppedImage
