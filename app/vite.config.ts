import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // 5174 para rodar ao lado do hub financeiro (5173).
  server: { port: 5174, strictPort: true },
  plugins: [
    react(),
    // Torna o site instalável no iPhone (Compartilhar → Adicionar à Tela de Início).
    // O service worker guarda só os arquivos do app; os dados vêm sempre do banco.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Hub de Produtividade',
        short_name: 'Hub',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#f5f5f2',
        theme_color: '#34507a',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
