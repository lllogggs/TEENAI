import React from 'react';

interface TermsModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    content: React.ReactNode;
}

const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose, title, content }) => {
    if (!isOpen) return null;

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
                <div className="p-6 overflow-y-auto custom-scrollbar text-sm leading-relaxed text-slate-600 space-y-4">
                    {content}
                </div>
                <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="px-5 py-2.5 bg-brand-900 text-white font-bold rounded-xl hover:bg-black transition-colors">
                        확인했습니다
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TermsModal;
