import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { TrashItem } from '../types';

const ROLE_LABELS: Record<string, string> = {
  master: 'MASTER',
  pm: 'PM',
  marketing: '마케팅',
  platform_md: '플랫폼MD',
  brand_md: '브랜드MD',
  global: '글로벌',
  cs: 'CS/경영지원',
};

function daysLeft(expiresAt: string): number {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear().toString().slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function TrashModal({ onClose }: { onClose: () => void }) {
  const loadTrash = useStore((s) => s.loadTrash);
  const restoreFromTrash = useStore((s) => s.restoreFromTrash);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    loadTrash().then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, [loadTrash]);

  async function handleRestore(trashId: string) {
    setRestoring(trashId);
    await restoreFromTrash(trashId);
    setItems((prev) => prev.filter((i) => i.trashId !== trashId));
    setRestoring(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">휴지통</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">삭제 후 {15}일이 지나면 자동으로 영구 삭제됩니다</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">불러오는 중…</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">휴지통이 비어 있습니다</div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="py-2 px-3 text-left text-gray-500 font-semibold">SKU명</th>
                  <th className="py-2 px-3 text-left text-gray-500 font-semibold whitespace-nowrap">카테고리</th>
                  <th className="py-2 px-3 text-left text-gray-500 font-semibold whitespace-nowrap">삭제한 사람</th>
                  <th className="py-2 px-3 text-left text-gray-500 font-semibold whitespace-nowrap">삭제 일시</th>
                  <th className="py-2 px-3 text-center text-gray-500 font-semibold whitespace-nowrap">남은 기간</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const left = daysLeft(item.expiresAt);
                  const isRestoring = restoring === item.trashId;
                  return (
                    <tr key={item.trashId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-medium text-gray-800 max-w-[200px] truncate">
                        {item.skuName}
                      </td>
                      <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">
                        {item.category} · {item.brand}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                          {ROLE_LABELS[item.deletedBy] ?? item.deletedBy}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">
                        {formatDate(item.deletedAt)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className={`font-semibold ${left <= 3 ? 'text-red-500' : left <= 7 ? 'text-amber-500' : 'text-gray-500'}`}>
                          {left}일
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleRestore(item.trashId)}
                          disabled={!!restoring}
                          className="text-xs px-2.5 py-1 rounded-lg border border-indigo-300 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isRestoring ? '복구 중…' : '복구'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
