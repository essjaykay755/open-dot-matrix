import { createRoot } from 'react-dom/client'
import App from './App'
import { initializeAppearance } from './lib/appearance'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/doto'
import './styles.css'
import './appearance.css'

initializeAppearance()

const root = document.getElementById('root')
if (!root) throw new Error('Renderer root element was not found')

createRoot(root).render(<App />)
