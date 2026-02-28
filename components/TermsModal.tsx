import React, { useEffect, useMemo, useState } from 'react';

interface TermsModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    content: React.ReactNode;
    onConfirm?: () => void;
    confirmLabel?: string;
    requireScrollToConfirm?: boolean;
}

const TermsModal: React.FC<TermsModalProps> = ({
    isOpen,
    onClose,
    title,
    content,
    onConfirm,
    confirmLabel = '확인했습니다',
    requireScrollToConfirm = false,
}) => {
    const [canConfirm, setCanConfirm] = useState(!requireScrollToConfirm);

    useEffect(() => {
        if (isOpen) {
            setCanConfirm(!requireScrollToConfirm);
            document.body.style.overflow = 'hidden';
            return;
        }
        document.body.style.overflow = 'unset';
    }, [isOpen, requireScrollToConfirm]);

    useEffect(() => {
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    const confirmButtonLabel = useMemo(() => {
        if (!requireScrollToConfirm) return confirmLabel;
        return canConfirm ? confirmLabel : '끝까지 읽어주세요';
    }, [canConfirm, confirmLabel, requireScrollToConfirm]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (!canConfirm) return;
        onConfirm?.();
        onClose();
    };

    const handleScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
        if (!requireScrollToConfirm) return;
        const el = e.currentTarget;
        const threshold = 12;
        const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
        if (isAtBottom) {
            setCanConfirm(true);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white rounded-t-2xl z-10">
                    <h3 className="text-lg font-black text-slate-900">{title}</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div
                    onScroll={handleScroll}
                    className="p-6 overflow-y-auto custom-scrollbar text-sm leading-relaxed text-slate-600 space-y-4"
                >
                    {content}
                </div>
                <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end sticky bottom-0 z-10">
                    <button
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        className="px-5 py-2.5 bg-brand-900 text-white font-bold rounded-xl hover:bg-black transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed disabled:hover:bg-slate-300"
                    >
                        {confirmButtonLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TermsModal;
