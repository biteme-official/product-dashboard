import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import type { ActivityLog } from '../types';

const ROLE_LABELS: Record<string, string> = {
  master: 'MASTER',
  pm: 'CPO',
  marketing: '마케팅',
  platform_md: '플랫폼MD',
  brand_md: '브랜드MD',
  global: '글로벌',
  cs: 'CS/경영지원',
  unknown: '–',
};

const ROLE_COLORS: Record<string, string> = {
  master: 'text-indigo-700 bg-indigo-50',
  pm: 'text-violet-700 bg-violet-50',
  marketing: 'text-pink-700 bg-pink-50',
  platform_md: 'text-emerald-700 bg-emerald-50',
  brand_md: 'text-amber-700 bg-amber-50',
  global: 'text-sky-700 bg-sky-50',
  cs: 'text-orange-700 bg-orange-50',
};

function formatDt(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ConfirmLogModal({ onClose }: { onClose: () => void }) {
  const loadActivityLogs = useStore((s) => s.loadActivityLogs);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadActivityLogs(300).then((data) => {
      setLogs(data);
      setLoading(false);
    });
  }, [loadActivityLogs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) => l.skuName.toLowerCase().includes(q));
  }, [logs, search]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[85vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-gray-900">수정 이력</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">최근 300건 · 필드 변경 및 확정 액션 기록</p>
            <p className="text-[10px] text-gray-300 mt-1">
              수집 항목: SKU명 · 카테고리 · 브랜드 · 출시일 · 판매가 · 메모 · 플랫폼/브랜드/글로벌 확정 · 가격 확정 · 일정 확정 · 발주 확정
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* 검색 */}
        <div className="px-5 py-2.5 border-b border-gray-100 shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SKU명 검색…"
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-indigo-400 placeholder-gray-300"
          />
        </div>

        {/* 테이블 */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">불러오는 중…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {search ? '검색 결과가 없습니다' : '수정 이력이 없습니다'}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">일시</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">역할</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-500">SKU명</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-500">변경 내역</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                    <td className="px-4 py-2.5 text-gray-400 tabular-nums whitespace-nowrap">{formatDt(log.changedAt)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_COLORS[log.role] ?? 'text-gray-600 bg-gray-100'}`}>
                        {ROLE_LABELS[log.role] ?? log.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[140px] truncate whitespace-nowrap">{log.skuName || '(이름 없음)'}</td>
                    <td className="px-4 py-2.5">
                      <div className="space-y-0.5">
                        {log.changes.map((c, i) => (
                          <div key={i} className="flex items-baseline gap-1 flex-wrap">
                            <span className="text-gray-500 shrink-0">{c.label}:</span>
                            <span className="text-gray-400 line-through shrink-0">{c.from}</span>
                            <span className="text-gray-300 shrink-0">→</span>
                            <span className="text-gray-800 font-medium shrink-0">{c.to}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-2 border-t border-gray-100 shrink-0 text-right">
          <span className="text-[11px] text-gray-400">{filtered.length}건</span>
        </div>
      </div>
    </div>
  );
}
