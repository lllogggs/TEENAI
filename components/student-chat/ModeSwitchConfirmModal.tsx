import React, { useEffect } from 'react';

interface ModeSwitchConfirmModalProps {
  isOpen: boolean;
  currentModeLabel: '대화' | '공부';
  nextModeLabel: '대화' | '공부';
  onConfirm: () => void;
  onClose: () => void;
}

const ModeSwitchConfirmModal: React.FC<ModeSwitchConfirmModalProps> = ({
  isOpen,
  currentModeLabel,
  nextModeLabel,
  onConfirm,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <button
        type="button"
        aria-label="모드 전환 안내 닫기"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[6px]"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] shadow-[0_30px_90px_rgba(15,23,42,0.28)] animate-in fade-in zoom-in-95 duration-200">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand-500 via-brand-700 to-[#7c3aed]" />

        <div className="p-6 md:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-brand-900 via-[#312e81] to-[#7c3aed] text-white shadow-lg shadow-brand-900/20">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 5l7 7-7 7" />
              </svg>
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-500">Mode Switch</p>
              <h2 className="mt-2 text-[1.45rem] font-black tracking-tight text-slate-900">
                {nextModeLabel === '공부' ? '학습 모드로 바꿔볼까요?' : '대화 모드로 돌아갈까요?'}
              </h2>
              <p className="mt-3 text-sm font-bold leading-6 text-slate-600">
                지금 대화는 <span className="text-slate-900">{currentModeLabel} 모드</span>로 저장되고 있어요.
                <br />
                <span className="text-slate-900">{nextModeLabel} 모드</span>로 바꾸면 새 대화가 열리고, 지금까지의 내용은 그대로 안전하게 남아 있어요.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-brand-100 bg-brand-50/70 px-4 py-3.5">
            <p className="text-sm font-bold leading-6 text-slate-700">
              괜찮다면 새 대화에서 <span className="text-brand-700">{nextModeLabel} 모드</span>로 이어서 시작할게요.
            </p>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-12 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-black text-slate-600 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50"
            >
              이대로 있을래요
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex h-12 items-center justify-center rounded-full bg-gradient-to-r from-brand-900 via-[#312e81] to-[#4338ca] px-6 text-sm font-black text-white shadow-lg shadow-brand-900/20 transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              {nextModeLabel} 모드로 전환
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModeSwitchConfirmModal;
