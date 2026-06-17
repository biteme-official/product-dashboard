import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useStore } from './store';
import { useAuth } from './store/auth';
import type { SkuData } from './types';
import { CategoryTabs } from './components/CategoryTabs';
import { SkuOrderSection } from './components/SkuOrderSection';
import { MdSummarySection } from './components/MdSummarySection';
import { BrandFilter } from './components/BrandFilter';
import { ManualTab } from './components/ManualTab';
import { LoginScreen } from './components/LoginScreen';
import { PinManager } from './components/PinManager';
import { ConfirmLogModal } from './components/ConfirmLogModal';
import { parseImportJson, type RawSkuInput } from './utils/importParser';
import { BulkImportModal } from './components/BulkImportModal';
import { usePermission } from './contexts/PermissionsContext';

type MainTab = 'pm' | 'projection' | 'md' | 'manual';

function useSessionState<T>(key: string, initial: T): [T, (val: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initial;
    } catch { return initial; }
  });
  const setter = useCallback((val: T) => {
    setState(val);
    try { sessionStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key]);
  return useMemo(() => [state, setter], [state, setter]);
}

interface PendingImport {
  _id: string;
  skus: RawSkuInput[];
}

const ROLE_META: Record<import('./utils/pin').Role, { label: string; color: string }> = {
  master:      { label: 'MASTER',   color: 'bg-indigo-100 text-indigo-700' },
  pm:          { label: 'PM',       color: 'bg-violet-100 text-violet-700' },
  marketing:   { label: '마케팅',   color: 'bg-pink-100 text-pink-700' },
  platform_md: { label: '플랫폼MD', color: 'bg-emerald-100 text-emerald-700' },
  brand_md:    { label: '브랜드MD', color: 'bg-amber-100 text-amber-700' },
  global:      { label: '글로벌',   color: 'bg-sky-100 text-sky-700' },
  cs:          { label: 'CS/경영지원', color: 'bg-orange-100 text-orange-700' },
};

function App() {
  const loadSkus = useStore((s) => s.loadSkus);
  const importSkus = useStore((s) => s.importSkus);
  const replaceAllSkus = useStore((s) => s.replaceAllSkus);
  const skus = useStore((s) => s.skus);
  const { role, logout } = useAuth();
  const perm = usePermission(role);

  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importState, setImportState] = useState<'idle' | 'done' | 'error'>('idle');
  const [showPinManager, setShowPinManager] = useState(false);
  const [showConfirmLog, setShowConfirmLog] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [backupState, setBackupState] = useState<'idle' | 'done' | 'error' | 'restoring' | 'rolling-back' | 'rolled-back'>('idle');
  const [activeMainTab, setActiveMainTab] = useSessionState<MainTab>('app:mainTab', 'projection');
  const [projectionSubTab, setProjectionSubTab] = useSessionState<string>('app:projectionSubTab', 'list-view');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleExport() {
    const data = skus.map(({ _initialSnapshot: _, isExpanded: __, ...rest }) => rest);
    const json = JSON.stringify({ version: 1, skus: data }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    a.download = `${date}_md-dashboard-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // 파일 파싱 (유효성 검사 먼저)
    let rawSkus: Omit<SkuData, '_initialSnapshot' | 'isExpanded'>[];
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      rawSkus = parsed.version === 1 ? parsed.skus : parsed;
      if (!Array.isArray(rawSkus) || rawSkus.length === 0) throw new Error('invalid');
    } catch {
      setBackupState('error');
      setTimeout(() => setBackupState('idle'), 4000);
      return;
    }

    // 복원 전: 현재 데이터 메모리 스냅샷 보관 + 자동 백업 파일 다운로드
    const snapshot = skus.map(({ _initialSnapshot: _, isExpanded: __, ...rest }) => rest);
    handleExport();

    setBackupState('restoring');
    try {
      await replaceAllSkus(rawSkus);
      setBackupState('done');
      setTimeout(() => setBackupState('idle'), 3000);
    } catch {
      // 복원 실패 → 메모리 스냅샷으로 자동 롤백
      setBackupState('rolling-back');
      try {
        await replaceAllSkus(snapshot);
        setBackupState('rolled-back');
      } catch {
        setBackupState('error');
      }
      setTimeout(() => setBackupState('idle'), 6000);
    }
  }

  useEffect(() => {
    return loadSkus(); // Firestore onSnapshot unsubscribe on unmount
  }, [loadSkus]);

  // pending-import.json 감지
  useEffect(() => {
    fetch('/pending-import.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data: PendingImport | null) => {
        if (!data?.skus?.length) return;
        const lastId = localStorage.getItem('lastImportId');
        if (lastId === data._id) return;
        setPending(data);
      });
  }, []);

  const handleImport = useCallback(async () => {
    if (!pending) return;
    try {
      const parsed = parseImportJson(pending.skus);
      await importSkus(parsed);
      localStorage.setItem('lastImportId', pending._id);
      setPending(null);
      setImportState('done');
      setTimeout(() => setImportState('idle'), 3000);
    } catch (e) {
      console.error('가져오기 실패:', e);
      setImportState('error');
      setTimeout(() => setImportState('idle'), 4000);
    }
  }, [pending, importSkus]);

  if (!role) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-gray-50">
      {showPinManager && <PinManager onClose={() => setShowPinManager(false)} />}
      {showConfirmLog && <ConfirmLogModal onClose={() => setShowConfirmLog(false)} />}
      {showBulkImport && <BulkImportModal onClose={() => setShowBulkImport(false)} />}
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 flex items-center gap-2 flex-wrap">
        <div>
          <h1 className="text-base font-bold text-gray-900 leading-tight">Product Dashboard</h1>
          <p className="text-xs text-gray-400 hidden sm:block">발주량 시뮬레이션 &amp; 월별 판매 계획</p>
        </div>

        {/* 역할 배지 + 관리 버튼 */}
        <div className="ml-auto flex items-center gap-1.5 flex-wrap justify-end">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ROLE_META[role].color}`}>
            {ROLE_META[role].label}
          </span>

          {/* 일괄 추가 */}
          {perm.skuBasic && (
            <button
              onClick={() => setShowBulkImport(true)}
              title="CSV로 SKU 일괄 추가"
              className="text-xs px-2.5 py-1 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors font-medium"
            >
              + 일괄 추가
            </button>
          )}

          {/* 내보내기 */}
          <button
            onClick={handleExport}
            title="전체 SKU 데이터를 JSON 파일로 저장"
            className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            ↓ 백업
          </button>

          {/* 가져오기 (Master만) */}
          {role === 'master' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={backupState === 'restoring' || backupState === 'rolling-back'}
                title="백업 JSON 파일로 데이터 복원 (복원 전 자동 백업 다운로드)"
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ↑ 복원
              </button>
              {backupState === 'restoring' && (
                <span className="text-xs text-blue-500 font-medium">복원 중…</span>
              )}
              {backupState === 'done' && (
                <span className="text-xs text-green-600 font-medium">✓ 복원 완료</span>
              )}
              {backupState === 'rolling-back' && (
                <span className="text-xs text-amber-600 font-medium">롤백 중…</span>
              )}
              {backupState === 'rolled-back' && (
                <span className="text-xs text-amber-600 font-medium">복원 실패 — 이전 데이터로 롤백됨</span>
              )}
              {backupState === 'error' && (
                <span className="text-xs text-red-500">복원 실패 (백업 파일로 수동 복원 필요)</span>
              )}

            </>
          )}

          {role === 'master' && (
            <>
              <button
                onClick={() => setShowConfirmLog(true)}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
              >
                확정 로그
              </button>
              <button
                onClick={() => setShowPinManager(true)}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
              >
                ⚙ PIN 관리
              </button>
            </>
          )}
          <button
            onClick={logout}
            className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            로그아웃
          </button>
        </div>

        {/* 가져오기 버튼 영역 */}
        <div className="flex items-center gap-2">
          {pending && importState === 'idle' && (
            <button
              onClick={handleImport}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <span>↓</span>
              <span>SKU {pending.skus.length}개 가져오기</span>
            </button>
          )}
          {importState === 'done' && (
            <span className="text-xs font-medium text-green-600 flex items-center gap-1">
              <span>✓</span> 가져오기 완료
            </span>
          )}
          {importState === 'error' && (
            <span className="text-xs font-medium text-red-500">
              가져오기 실패 — 콘솔을 확인하세요
            </span>
          )}
        </div>
      </header>

      {/* 탭 + 카테고리 탭 + 브랜드 필터 (sticky) */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        {/* 최상단 탭 */}
        <div className="flex items-center gap-1 px-3 pt-2 pb-0 border-b border-gray-100">
          {([
            { key: 'projection', label: '프로젝션' },
            { key: 'pm', label: 'SKU 리스트' },
            { key: 'md', label: '채널별 요약' },
          ] as { key: MainTab; label: string }[]).map(({ key, label }) => {
            const isActive = activeMainTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveMainTab(key)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-t-lg border-b-2 transition-all ${
                  isActive
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50/60'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            );
          })}
          <div className="w-px h-5 bg-gray-200 mx-1 self-center" />
          <button
            onClick={() => setActiveMainTab('manual')}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-all ${
              activeMainTab === 'manual'
                ? 'border-gray-400 text-gray-700 bg-gray-50'
                : 'border-transparent text-gray-400 hover:text-gray-500 hover:bg-gray-50'
            }`}
          >
            메뉴얼
          </button>
        </div>

        {/* 프로젝션 서브탭 */}
        {activeMainTab === 'projection' && (
          <div className="flex gap-1 p-3 bg-white border-b border-gray-200 overflow-x-auto scrollbar-none">
            {[
              { key: 'list-view', label: 'LIST VIEW' },
              { key: 'channel-schedule', label: '채널별 오픈일정' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setProjectionSubTab(key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex-shrink-0 ${
                  projectionSubTab === key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 카테고리 탭 + 브랜드 필터 (SKU 리스트, 채널별 요약) */}
        {(activeMainTab === 'pm' || activeMainTab === 'md') && (
          <>
            <CategoryTabs />
            <BrandFilter />
          </>
        )}
      </div>

      {/* 메인 콘텐츠 */}
      <main className={activeMainTab === 'projection' ? '' : 'max-w-screen-xl mx-auto'}>
        {activeMainTab === 'manual' ? (
          <ManualTab />
        ) : activeMainTab === 'pm' ? (
          <SkuOrderSection mode="sku" onSwitchToSkuList={() => setActiveMainTab('pm')} />
        ) : activeMainTab === 'projection' ? (
          <SkuOrderSection mode="projection" subTab={projectionSubTab} onSwitchToSkuList={() => setActiveMainTab('pm')} />
        ) : (
          <div className="px-4 py-4">
            <MdSummarySection />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
