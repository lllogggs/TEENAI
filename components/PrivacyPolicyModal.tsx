import React, { useEffect } from 'react';

interface PrivacyPolicyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative bg-white w-full max-w-2xl rounded-2xl md:rounded-[2rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="flex items-center justify-between p-5 md:p-8 border-b border-slate-100">
                    <div>
                        <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">개인정보처리방침 및 Forteen AI 안내</h2>
                        <p className="text-xs md:text-sm font-bold text-brand-600 mt-1">Forteen AI Privacy Hub</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 md:p-8 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
                    <div className="prose prose-sm md:prose-base prose-slate max-w-none text-slate-600 space-y-8">

                        <section className="bg-white p-5 md:p-6 rounded-2xl border border-brand-100 shadow-sm">
                            <h3 className="text-lg font-black text-brand-900 mb-3 flex items-center gap-2">
                                <span>🤖</span> AI의 한계 및 면책 조항
                            </h3>
                            <ul className="space-y-2 font-medium text-sm leading-relaxed">
                                <li className="flex gap-2"><span className="text-brand-500 shrink-0">•</span> <strong>Forteen AI는 인공지능입니다.</strong> 따라서 인물, 사실, 사건에 관한 정보를 제공할 때 부정확하거나 환각(Hallucination) 현상이 포함된 답변을 생성할 수 있습니다.</li>
                                <li className="flex gap-2"><span className="text-brand-500 shrink-0">•</span> <strong>중대한 결정 주의:</strong> 생성된 답변은 의학적 처방, 법률적 조언 혹은 전문적인 심리 상담을 대체할 수 없습니다. 위급하거나 중요한 상황에서는 반드시 보호자나 전문가와 상의하시기 바랍니다.</li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="text-lg font-black text-slate-800 mb-3 text-balance">수집하는 데이터</h3>
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
                                <p className="font-bold text-sm text-slate-700">Forteen AI 이용 시 다음 정보가 수집 및 저장됩니다.</p>
                                <ul className="space-y-2 text-sm">
                                    <li><strong>가입 정보:</strong> 이름, 학교, 이메일 등 계정 정보</li>
                                    <li><strong>대화 기록:</strong> 프롬프트(질문), 업로드한 이미지 및 AI의 답변 내용 원문</li>
                                    <li><strong>음성 데이터:</strong> 음성 입력 시 변환된 텍스트 데이터 (오디오 파일 원본은 저장하지 않습니다)</li>
                                </ul>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-lg font-black text-slate-800 mb-3 text-balance">데이터의 활용 및 부모 모니터링</h3>
                            <p className="text-sm leading-relaxed mb-4 font-medium">
                                Forteen AI는 청소년의 <strong>안전한 AI 이용 환경</strong>을 최우선으로 합니다.
                                청소년 자녀(학생 멤버)의 계정은 부모(학부모 멤버)의 계정과 연동되며, 이에 따라 다음과 같은 모니터링 기능이 작동합니다.
                            </p>
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="bg-white p-4 rounded-xl border border-slate-200">
                                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><span className="text-rose-500">🚨</span> 안전 알림</h4>
                                    <p className="text-xs leading-relaxed text-slate-600">위험 단어나 자해, 폭력 등의 정황이 감지되면 즉시 화면에 경고 알림이 표시되며, 보호자 대시보드에 위험 수준이 기록됩니다.</p>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200">
                                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><span className="text-blue-500">📊</span> 보호자 대시보드</h4>
                                    <p className="text-xs leading-relaxed text-slate-600">대화 원문 자체는 자녀의 프라이버시를 위해 완전히 공개되지 않으나, 참여도, 감정 상태 요약, 관심사 등의 분석 리포트가 보호자에게 정기적으로 제공될 수 있습니다.</p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-lg font-black text-slate-800 mb-3">데이터 삭제 및 보관 기한</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed">
                                <li>사용자가 대화 세션을 삭제(Soft Delete)할 수 있으나, 안전을 위해 서버 상에는 일정 기간 보관될 수 있습니다.</li>
                                <li>회원 탈퇴 시 모든 대화 기록과 연동 정보는 관련 법령에 따라 즉시 파기되거나 익명화 처리됩니다.</li>
                                <li>Forteen AI는 사용자의 개인 대화 및 이미지를 본 서비스 응답 외의 외부 인공지능 학습(Training)용으로 임의 탈취하거나 제공하지 않습니다.</li>
                            </ul>
                        </section>

                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 md:p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 bg-brand-900 text-white font-bold rounded-xl hover:bg-black transition-colors shadow-sm"
                    >
                        확인 및 닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PrivacyPolicyModal;
