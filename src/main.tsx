import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PermissionsProvider } from './contexts/PermissionsContext.tsx'
import { ensureAuth } from './lib/firebase.ts'
import { cpoFsdb } from './lib/cpoFirebase.ts'
import { startIdleNetworkGuard } from './lib/idleNetwork.ts'

ensureAuth().then(() => {
  // 15분 동안 조작이 없으면 CPO 서버 연결을 끊어 밤새 켜둔 탭의 재연결 전체 재읽기를 막는다(lib/idleNetwork.ts)
  startIdleNetworkGuard(cpoFsdb, 'cpo');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PermissionsProvider>
        <App />
      </PermissionsProvider>
    </StrictMode>,
  );
});
