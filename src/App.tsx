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

type MainTab = 'pm' | 'md' | 'manual';

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
  platform_md: { label: '플랫폼MD', color: 'bg-emerald-100 text-emerald-700' },
  brand_md:    { label: '브랜드MD', color: 'bg-amber-100 text-amber-700' },
  global:      { label: '글로벌',   color: 'bg-sky-100 text-sky-700' },
};

function App() {
  const loadSkus = useStore((s) => s.loadSkus);
  const importSkus = useStore((s) => s.importSkus);
  const replaceAllSkus = useStore((s) => s.replaceAllSkus);
  const skus = useStore((s) => s.skus);
  const { role, logout } = useAuth();

  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importState, setImportState] = useState<'idle' | 'done' | 'error'>('idle');
  const [showPinManager, setShowPinManager] = useState(false);
  const [showConfirmLog, setShowConfirmLog] = useState(false);
  const [backupState, setBackupState] = useState<'idle' | 'done' | 'error'>('idle');
  const [activeMainTab, setActiveMainTab] = useSessionState<MainTab>('app:mainTab', 'pm');
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
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const rawSkus: Omit<SkuData, '_initialSnapshot' | 'isExpanded'>[] =
        parsed.version === 1 ? parsed.skus : parsed;
      if (!Array.isArray(rawSkus) || rawSkus.length === 0) throw new Error('invalid');
      await replaceAllSkus(rawSkus);
      setBackupState('done');
      setTimeout(() => setBackupState('idle'), 3000);
    } catch {
      setBackupState('error');
      setTimeout(() => setBackupState('idle'), 4000);
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
                title="백업 JSON 파일로 데이터 복원 (기존 데이터 전체 교체)"
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
              >
                ↑ 복원
              </button>
              {backupState === 'done' && (
                <span className="text-xs text-green-600 font-medium">✓ 복원 완료</span>
              )}
              {backupState === 'error' && (
                <span className="text-xs text-red-500">복원 실패</span>
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

      {/* PM / MD 탭 + 카테고리 탭 + 브랜드 필터 (sticky) */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        {/* 최상단: PM / MD 탭 */}
        <div className="flex items-center gap-1 px-3 pt-2 pb-0 border-b border-gray-100">
          {([
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
        {activeMainTab === 'manual' ? null : (
          <>
            <CategoryTabs />
            <BrandFilter />
          </>
        )}
      </div>

      {/* 메인 콘텐츠 */}
      <main className="max-w-screen-xl mx-auto">
        {activeMainTab === 'manual' ? (
          <ManualTab />
        ) : activeMainTab === 'pm' ? (
          <>
            {/* Section A */}
            <SkuOrderSection />
          </>
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
