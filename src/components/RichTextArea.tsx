import { useRef, useEffect } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
}

export function RichTextArea({ value, onChange, placeholder, rows = 3 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = value;
      ref.current.dataset.empty = ref.current.innerText.trim() === '' ? 'true' : 'false';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exec(cmd: string) {
    ref.current?.focus();
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand(cmd, false);
    sync();
  }

  function sync() {
    const el = ref.current;
    if (!el) return;
    el.dataset.empty = el.innerText.trim() === '' ? 'true' : 'false';
    onChange(el.innerHTML);
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-400">
      {/* 툴바 */}
      <div className="flex items-center gap-0.5 px-2 py-1 bg-gray-50 border-b border-gray-100">
        <ToolBtn onClick={() => exec('bold')} title="Bold (굵게)">
          <span className="font-bold">B</span>
        </ToolBtn>
        <ToolBtn onClick={() => exec('italic')} title="Italic (기울임)">
          <span className="italic">I</span>
        </ToolBtn>
        <span className="w-px h-3 bg-gray-300 mx-1 shrink-0" />
        <ToolBtn onClick={() => exec('insertUnorderedList')} title="불릿 목록">
          <span className="flex items-center gap-0.5">
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="2" cy="4.5" r="1.5" />
              <rect x="5" y="3.75" width="10" height="1.5" rx="0.75" />
              <circle cx="2" cy="8" r="1.5" />
              <rect x="5" y="7.25" width="10" height="1.5" rx="0.75" />
              <circle cx="2" cy="11.5" r="1.5" />
              <rect x="5" y="10.75" width="10" height="1.5" rx="0.75" />
            </svg>
            목록
          </span>
        </ToolBtn>
      </div>

      {/* 에디터 */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        data-placeholder={placeholder}
        data-empty="true"
        className="rich-editor px-3 py-2 text-sm outline-none"
        style={{ minHeight: `${rows * 1.625}rem` }}
      />
    </div>
  );
}

function ToolBtn({
  children, onClick, title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className="px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-200 rounded transition-colors"
    >
      {children}
    </button>
  );
}
