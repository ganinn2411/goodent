import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({
  base: './',
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: { name:'Goodent Laboratuvar', short_name:'Goodent', start_url:'./', scope:'./', display:'standalone',
      background_color:'#ffffff', theme_color:'#0b5ea8',
      icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png'},{src:'icon-512.png',sizes:'512x512',type:'image/png'}] }
  })]
})
