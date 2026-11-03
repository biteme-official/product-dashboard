import { useEffect, useRef, type KeyboardEvent } from 'react';

// ── 메모 박스 ────────────────────────────────────────────────────────────
export function MemoBox({ skuId, memo, readOnly, onSave }: {
  skuId: string; memo: string; readOnly?: boolean; onSave: (html: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = memo ?? '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuId]);

  function applyBold() { editorRef.current?.focus(); document.execCommand('bold'); }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); document.execCommand('bold'); }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-500">메모</label>
        {!readOnly && (
          <button
            onMouseDown={(e) => { e.preventDefault(); applyBold(); }}
            title="볼드 (Ctrl+B)"
            className="text-xs px-2 py-0.5 border border-gray-200 rounded font-bold text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors leading-5"
          >B</button>
        )}
      </div>
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onBlur={readOnly ? undefined : () => onSave(editorRef.current?.innerHTML ?? '')}
        onKeyDown={readOnly ? undefined : handleKeyDown}
        className={`w-full min-h-[90px] px-3 py-2.5 text-sm text-gray-700 leading-relaxed border border-gray-200 rounded-lg resize-none overflow-y-auto break-words ${
          readOnly ? 'bg-gray-50 cursor-not-allowed' : 'focus:outline-none focus:ring-2 focus:ring-indigo-400'
        }`}
        style={{ wordBreak: 'break-word' }}
        data-placeholder="메모를 입력하세요..."
      />
      <style>{`[contenteditable]:empty:before{content:attr(data-placeholder);color:#d1d5db;pointer-events:none}`}</style>
    </div>
  );
}
