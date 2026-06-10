import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { fsdb } from '../lib/firebase';

interface LogEntry {
  id: string;
  skuName: string;
  action: '확정' | '확정취소';
  role: string;
  timestamp: Date | null;
}

interface Props {
  onClose: () => void;
}

export function ConfirmLogModal({ onClose }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(fsdb, 'confirmLogs'),
      orderBy('timestamp', 'desc'),
      limit(100),
    );
    getDocs(q)
      .then((snap) => {
        setLogs(
          snap.docs.map((d) => ({
            id: d.id,
            skuName: d.data().skuName as string,
            action: d.data().action as '확정' | '확정취소',
            role: d.data().role as string,
            timestamp: d.data().timestamp?.toDate() ?? null,
          })),
        );
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">확정 이력 로그</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh]">
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-10">불러오는 중...</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-10">로그가 없습니다.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 border-b border-gray-200">시간</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 border-b border-gray-200">SKU명</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-gray-500 border-b border-gray-200">액션</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-gray-500 border-b border-gray-200">역할</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-500 tabular-nums whitespace-nowrap">
                      {log.timestamp
                        ? log.timestamp.toLocaleString('ko-KR', {
                            year: '2-digit', month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : '–'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 font-medium max-w-[160px] truncate">
                      {log.skuName}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${
                        log.action === '확정'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-red-100 text-red-600'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${
                        log.role === 'md'
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                          : log.role === 'pm'
                          ? 'bg-violet-50 text-violet-600 border border-violet-200'
                          : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                      }`}>
                        {log.role.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
