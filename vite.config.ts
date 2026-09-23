import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 배포마다 달라지는 빌드 ID — 앱 번들에 박히고(__BUILD_ID__), 같은 값이 dist/version.json으로도 나간다.
// 열려 있는 탭이 version.json을 주기적으로 확인해 자기 빌드 ID와 다르면 새 버전 배포로 보고 새로고침한다
// (src/hooks/useVersionCheck.ts). 구버전 탭이 옛날 코드로 데이터를 덮어쓰는 사고(2026-09-23) 재발 방지.
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`

function versionFile(): Plugin {
  return {
    name: 'emit-version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId: BUILD_ID }) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api/tableau': {
        target: 'https://prod-apnortheast-a.online.tableau.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/tableau/, ''),
      },
    },
  },
})
