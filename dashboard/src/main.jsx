import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Checkout from './Checkout.jsx'

const payMatch = window.location.pathname.match(/^\/pay\/([^/]+)/)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {payMatch ? <Checkout linkId={payMatch[1]} /> : <App />}
  </StrictMode>,
)
