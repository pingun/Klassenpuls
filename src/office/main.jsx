import React from 'react'
import ReactDOM from 'react-dom/client'
import '../styles.css'
import './office.css'
import OfficeApp from './OfficeApp'
import { officeReady } from './officeBridge'

officeReady().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode><OfficeApp /></React.StrictMode>,
  )
})
