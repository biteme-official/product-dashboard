import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useStore } from './store';
import { useAuth } from './store/auth';
import { useCpoSync } from './store/cpoSync';
import { useVisibleSkus } from './hooks/useVisibleSkus';
import { useCpoCardSync } from './hooks/useCpoCardSync';
import { useCpoPriceSync } from './hooks/useCpoPriceSync';
import type { SkuData, Category } from './types';
import type { Brand } from './types';
import { CategoryTabs } from './components/CategoryTabs';
import { SkuOrderSection } from './components/SkuOrderSection';
import { MdSummarySection } from './components/MdSummarySection';
import { BrandFilter } from './components/BrandFilter';
import { ManualTab } from './components/ManualTab';
import { LoginScreen } from './components/LoginScreen';
import { AdminSection } from './components/AdminSection';
import { parseImportJson, type RawSkuInput } from './utils/importParser';
import { BulkImportModal } from './components/BulkImportModal';
import { usePermission } from './contexts/PermissionsContext';
import { getPortalToken, verifyPortalToken, cleanPortalToken } from './utils/portalAuth';

type MainTab = 'pm' | 'projection' | 'md' | 'manual' | 'admin';

interface NavSnapshot {
  mainTab: MainTab;
  projectionSubTab: string;
  activeCategory: Category;
  activeBrand: Brand | '전체';
  expandedSkuIds: string[];
  listCatFilter: Set<string>;
  listBrandFilter: Set<string>;
  listMonthFilter: Set<string>;
  searchQuery: string;
  scrollY: number;
}

const MAIN_TAB_LABELS: Record<MainTab, string> = {
  pm: 'SKU 리스트',
  projection: 'LIST VIEW',
  md: '채널별 요약',
  manual: '메뉴얼',
  admin: '관리',
};

function getNavLabel(snap: NavSnapshot): string {
  if (snap.mainTab === 'projection') {
    return snap.projectionSubTab === 'list-view' ? 'LIST VIEW' : '채널별 오픈일정';
  }
  return MAIN_TAB_LABELS[snap.mainTab];
}

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
  viewer:      { label: 'VIEWER',   color: 'bg-gray-100 text-gray-600' },
  platform_md: { label: '플랫폼MD', color: 'bg-emerald-100 text-emerald-700' },
  brand_md:    { label: '브랜드MD', color: 'bg-amber-100 text-amber-700' },
  global:      { label: '글로벌',   color: 'bg-sky-100 text-sky-700' },
};

function App() {
  const loadSkus = useStore((s) => s.loadSkus);
  const loadCpoSync = useCpoSync((s) => s.loadCpoSync);
  useCpoCardSync();
  useCpoPriceSync();
  const importSkus = useStore((s) => s.importSkus);
  const replaceAllSkus = useStore((s) => s.replaceAllSkus);
  const skus = useVisibleSkus();
  const storeActiveCategory = useStore((s) => s.activeCategory);
  const storeActiveBrand = useStore((s) => s.activeBrand);
  const setActiveCategory = useStore((s) => s.setActiveCategory);
  const setActiveBrand = useStore((s) => s.setActiveBrand);
  const expandOnly = useStore((s) => s.expandOnly);
  const setExpandedIds = useStore((s) => s.setExpandedIds);
  const { role, setRole, logout } = useAuth();
  const perm = usePermission(role);
  const [portalAuthChecked, setPortalAuthChecked] = useState(false);

  useEffect(() => {
    const token = getPortalToken();
    if (!token) { setPortalAuthChecked(true); return; }
    verifyPortalToken(token).then((r) => {
      if (r) setRole(r);
      cleanPortalToken();
      setPortalAuthChecked(true);
    });
  }, [setRole]);

  const [pending, setPending] = useState<PendingImport | null>(null);
  const [importState, setImportState] = useState<'idle' | 'done' | 'error'>('idle');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [backupState, setBackupState] = useState<'idle' | 'done' | 'error' | 'restoring' | 'rolling-back' | 'rolled-back'>('idle');
  const [activeMainTab, setActiveMainTab] = useSessionState<MainTab>('app:mainTab', 'projection');
  const [projectionSubTab, setProjectionSubTab] = useSessionState<string>('app:projectionSubTab', 'list-view');
  const [mdCategory, setMdCategory] = useState<Category | '전체'>('전체');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevRoleRef = useRef<typeof role>(null);

  // 내비게이션 히스토리
  const [navHistory, setNavHistory] = useState<NavSnapshot[]>([]);

  // 프로젝션 필터 상태 (SkuOrderSection에서 리프트 → 히스토리 복원에 사용)
  const [listCatFilter, setListCatFilter] = useState<Set<string>>(new Set());
  const [listBrandFilter, setListBrandFilter] = useState<Set<string>>(new Set());
  const [listMonthFilter, setListMonthFilter] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  // 로그인 시(role이 null→유효값으로 전환) 프로젝션 List view로 초기화
  useEffect(() => {
    if (prevRoleRef.current === null && role !== null) {
      setActiveMainTab('projection');
      setProjectionSubTab('list-view');
    }
    prevRoleRef.current = role;
  }, [role, setActiveMainTab, setProjectionSubTab]);

  function pushNavHistory() {
    const snapshot: NavSnapshot = {
      mainTab: activeMainTab,
      projectionSubTab,
      activeCategory: storeActiveCategory,
      activeBrand: storeActiveBrand,
      expandedSkuIds: skus.filter((s) => s.isExpanded).map((s) => s.id),
      listCatFilter: new Set(listCatFilter),
      listBrandFilter: new Set(listBrandFilter),
      listMonthFilter: new Set(listMonthFilter),
      searchQuery,
      scrollY: window.scrollY,
    };
    setNavHistory((prev) => [...prev.slice(-19), snapshot]);
  }

  function goBack() {
    const prev = navHistory[navHistory.length - 1];
    if (!prev) return;
    setNavHistory((h) => h.slice(0, -1));
    setActiveMainTab(prev.mainTab);
    setProjectionSubTab(prev.projectionSubTab);
    setActiveCategory(prev.activeCategory);
    setActiveBrand(prev.activeBrand);
    setExpandedIds(prev.expandedSkuIds);
    setListCatFilter(new Set(prev.listCatFilter));
    setListBrandFilter(new Set(prev.listBrandFilter));
    setListMonthFilter(new Set(prev.listMonthFilter));
    setSearchQuery(prev.searchQuery);
    setTimeout(() => window.scrollTo({ top: prev.scrollY }), 50);
  }

  function handleNavigateToSku(sku: SkuData) {
    pushNavHistory();
    setActiveMainTab('pm');
    setActiveCategory(sku.category);
    setTimeout(() => {
      expandOnly(sku.id);
      setTimeout(() => {
        document.getElementById(`sku-card-${sku.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }, 0);
  }

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

  useEffect(() => {
    return loadCpoSync(); // CPO 대시보드 읽기전용 구독 unsubscribe on unmount
  }, [loadCpoSync]);

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

  if (!portalAuthChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-sm text-gray-400">인증 확인 중...</span>
      </div>
    );
  }

  if (!role) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-gray-50">
      {showBulkImport && <BulkImportModal onClose={() => setShowBulkImport(false)} />}
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 flex items-center gap-2 flex-wrap">
        <div>
          <h1 className="text-base font-bold text-gray-900 leading-tight">바잇미 제품 프로젝션</h1>
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
          {/* 뒤로가기 버튼 */}
          {navHistory.length > 0 && (
            <button
              onClick={goBack}
              className="flex items-center gap-1 px-2.5 py-1 mr-1 text-xs font-medium text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex-shrink-0 border border-gray-200 hover:border-indigo-300"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {getNavLabel(navHistory[navHistory.length - 1])}
            </button>
          )}
          {([
            { key: 'projection', label: '프로젝션' },
            { key: 'pm', label: 'SKU 리스트' },
            { key: 'md', label: '채널별 요약' },
          ] as { key: MainTab; label: string }[]).map(({ key, label }) => {
            const isActive = activeMainTab === key;
            return (
              <button
                key={key}
                onClick={() => { pushNavHistory(); setActiveMainTab(key); }}
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
            onClick={() => { pushNavHistory(); setActiveMainTab('manual'); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-all ${
              activeMainTab === 'manual'
                ? 'border-gray-400 text-gray-700 bg-gray-50'
                : 'border-transparent text-gray-400 hover:text-gray-500 hover:bg-gray-50'
            }`}
          >
            메뉴얼
          </button>
          {role === 'master' && (
            <button
              onClick={() => { pushNavHistory(); setActiveMainTab('admin'); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-all ${
                activeMainTab === 'admin'
                  ? 'border-gray-400 text-gray-700 bg-gray-50'
                  : 'border-transparent text-gray-400 hover:text-gray-500 hover:bg-gray-50'
              }`}
            >
              관리
            </button>
          )}
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
                onClick={() => { pushNavHistory(); setProjectionSubTab(key); }}
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
        {activeMainTab === 'pm' && (
          <>
            <CategoryTabs />
            <BrandFilter />
          </>
        )}
        {activeMainTab === 'md' && (
          <>
            <CategoryTabs showAll={true} value={mdCategory} onChange={setMdCategory} />
            <BrandFilter categoryFilter={mdCategory} />
          </>
        )}
      </div>

      {/* 메인 콘텐츠 */}
      <main className={activeMainTab === 'projection' ? '' : 'max-w-screen-xl mx-auto'}>
        {activeMainTab === 'manual' ? (
          <ManualTab />
        ) : activeMainTab === 'admin' ? (
          role === 'master' ? <AdminSection /> : null
        ) : activeMainTab === 'pm' ? (
          <SkuOrderSection
            mode="sku"
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
          />
        ) : activeMainTab === 'projection' ? (
          <SkuOrderSection
            mode="projection"
            subTab={projectionSubTab}
            listCatFilter={listCatFilter}
            listBrandFilter={listBrandFilter}
            listMonthFilter={listMonthFilter}
            searchQuery={searchQuery}
            onListCatFilterChange={setListCatFilter}
            onListBrandFilterChange={setListBrandFilter}
            onListMonthFilterChange={setListMonthFilter}
            onSearchQueryChange={setSearchQuery}
            onNavigateToSku={handleNavigateToSku}
          />
        ) : (
          <div className="px-4 py-4">
            <MdSummarySection categoryFilter={mdCategory} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
