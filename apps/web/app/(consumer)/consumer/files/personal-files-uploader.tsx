'use client';
import { useRef } from 'react';
import { Upload } from 'lucide-react';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx,.xls,.xlsx,application/pdf,image/jpeg,image/png,image/heic,image/heif';

export function PersonalFilesUploader({
  onSelect, disabled,
}: {
  onSelect: (files: File[]) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-elev-1 transition hover:bg-brand-700 disabled:opacity-40"
      >
        <Upload className="h-4 w-4" /> Upload
      </button>
      <input
        ref={ref}
        type="file"
        multiple
        accept={ACCEPT}
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onSelect(files);
          e.target.value = '';
        }}
      />
    </>
  );
}
