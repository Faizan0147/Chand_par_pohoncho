import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' + HashRouter => works on GitHub Pages under any repo name, and from file://
export default defineConfig({ base: './', plugins: [react()] })
