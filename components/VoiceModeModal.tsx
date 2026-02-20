import React, { useState, useRef, useEffect } from 'react';

interface VoiceModeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTextSubmit: (text: string) => Promise<string>; // Returns AI text response
    onPlayAudio: (text: string) => Promise<void>; // Sends text to TTS and plays
}

const VoiceModeModal: React.FC<VoiceModeModalProps> = ({ isOpen, onClose, onTextSubmit, onPlayAudio }) => {
    const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');

    const speechRecognitionRef = useRef<any>(null);
    const currentTranscriptRef = useRef<string>('');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // VAD (Voice Activity Detection) refs
    const silenceStartRef = useRef<number>(Date.now());
    const isSpeakingRef = useRef<boolean>(false);
    const isModalOpenRef = useRef<boolean>(isOpen);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        isModalOpenRef.current = isOpen;
        if (isOpen) {
            startListening();
        } else {
            stopAll();
        }
        return stopAll;
    }, [isOpen]);

    const stopAll = () => {
        if (speechRecognitionRef.current) {
            speechRecognitionRef.current.stop();
            speechRecognitionRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { });
            audioContextRef.current = null;
        }
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = 0;
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setStatus('idle');
    };

    const drawWaveform = () => {
        if (!canvasRef.current || !analyserRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteTimeDomainData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 4;
        ctx.strokeStyle = status === 'listening' ? '#4f46e5' : '#94a3b8';
        ctx.beginPath();

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;
        let sum = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * canvas.height) / 2;
            sum += Math.abs(dataArray[i] - 128);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();

        // Simple VAD Logic
        if (status === 'listening' && speechRecognitionRef.current) {
            const avg = sum / bufferLength;
            const threshold = 3; // Sensitivity threshold

            if (avg > threshold) {
                isSpeakingRef.current = true;
                silenceStartRef.current = Date.now();
            } else {
                // If user was speaking and now has been silent for 1.5 seconds
                if (isSpeakingRef.current && Date.now() - silenceStartRef.current > 1500) {
                    isSpeakingRef.current = false;
                    handleStopAndSend();
                }
            }
        }

        animationRef.current = requestAnimationFrame(drawWaveform);
    };

    const startListening = async () => {
        stopAll();
        setStatus('listening');
        silenceStartRef.current = Date.now();
        isSpeakingRef.current = false;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!isModalOpenRef.current) {
                stream.getTracks().forEach(t => t.stop());
                return;
            }
            streamRef.current = stream;

            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;
            const analyser = audioContext.createAnalyser();
            analyserRef.current = analyser;
            analyser.fftSize = 256;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            drawWaveform();

            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognition) {
                alert('실시간 음성 인식을 지원하지 않는 브라우저입니다.');
                onClose();
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.lang = 'ko-KR';
            recognition.interimResults = true;
            recognition.continuous = true;

            speechRecognitionRef.current = recognition;

            recognition.onresult = (event: any) => {
                let fullTranscript = '';
                for (let i = 0; i < event.results.length; ++i) {
                    fullTranscript += event.results[i][0].transcript;
                }
                currentTranscriptRef.current = fullTranscript;

                if (fullTranscript.trim()) {
                    isSpeakingRef.current = true;
                    silenceStartRef.current = Date.now(); // reset silence timeout
                }
            };

            recognition.onerror = (event: any) => {
                console.error('Speech recognition error in conversation modal', event.error);
                if (event.error !== 'no-speech' && status === 'listening') {
                    // fall back
                }
            };

            recognition.onend = () => {
                // Keep it alive if we are still supposed to be listening
                if (status === 'listening' && isModalOpenRef.current) {
                    try { recognition.start(); } catch { }
                }
            };

            recognition.start();

        } catch (err) {
            console.error('Failed to start recording', err);
            setStatus('idle');
            alert('마이크 접근 권한이 필요합니다.');
        }
    };

    const handleStopAndSend = () => {
        if (speechRecognitionRef.current) {
            speechRecognitionRef.current.stop();
        }
        processTranscriptAndSend();
    };

    const processTranscriptAndSend = async () => {
        if (!isModalOpenRef.current || status !== 'listening') return;

        const text = currentTranscriptRef.current.trim();
        if (!text) {
            if (isModalOpenRef.current) startListening();
            return;
        }

        setStatus('processing');

        try {
            const aiText = await onTextSubmit(text);
            if (!isModalOpenRef.current) return;

            setStatus('speaking');
            await onPlayAudio(aiText);

            if (isModalOpenRef.current) {
                startListening();
            }
        } catch (e) {
            console.error('Voice loop error:', e);
            if (isModalOpenRef.current) setStatus('idle');
        }
    };

    const handleMainButtonClick = () => {
        if (status === 'listening') {
            // Manual send
            isSpeakingRef.current = false;
            handleStopAndSend();
        } else if (status === 'speaking' || status === 'processing') {
            // Interrupt
            startListening();
        } else if (status === 'idle') {
            startListening();
        }
    };

    if (!isOpen) return null;

    const getStatusText = () => {
        switch (status) {
            case 'listening': return isSpeakingRef.current ? "듣고 있어요..." : "자유롭게 말씀하세요 (자동 전송)";
            case 'processing': return "생각 중...";
            case 'speaking': return "말하는 중... (클릭 시 중단)";
            case 'idle': return "클릭하여 대화 시작";
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-brand-900/95 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
            <button onClick={onClose} className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <div className="text-center mb-12">
                <div className="w-24 h-24 bg-white/10 rounded-full mx-auto flex items-center justify-center mb-6 shadow-2xl shadow-brand-500/20 text-white">
                    {/* SVG for Voice Conversation */}
                    <svg className={`w-12 h-12 ${status === 'listening' ? 'animate-pulse' : ''}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="11" fill="currentColor" fillOpacity="0.2" />
                        <rect x="8.5" y="10" width="1.5" height="4" rx="0.75" fill="white" />
                        <rect x="11.25" y="7" width="1.5" height="10" rx="0.75" fill="white" />
                        <rect x="14" y="9" width="1.5" height="6" rx="0.75" fill="white" />
                    </svg>
                </div>
                <h2 className="text-3xl font-black text-white mb-3">포텐 AI 대화 모드</h2>
                <p className={`font-bold transition-colors ${status === 'processing' ? 'text-brand-300 animate-pulse' : 'text-brand-200'}`}>
                    {getStatusText()}
                </p>
            </div>

            <div className="w-full max-w-md h-32 bg-brand-900/50 rounded-3xl mb-12 relative overflow-hidden flex items-center justify-center border border-white/10">
                <canvas ref={canvasRef} width={400} height={100} className="w-full h-full opacity-80" />
            </div>

            <button
                onClick={handleMainButtonClick}
                className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-all 
                ${status === 'listening' ? 'bg-rose-500 shadow-rose-500/50 hover:bg-rose-600' : ''}
                ${status === 'processing' ? 'bg-slate-500 cursor-wait shadow-slate-500/50' : ''}
                ${status === 'speaking' ? 'bg-brand-500 shadow-brand-500/50 hover:bg-brand-600 animate-pulse' : ''}
                ${status === 'idle' ? 'bg-white text-brand-900 hover:scale-105' : 'text-white scale-105'}
                `}
            >
                {status === 'listening' ? (
                    <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd"></path></svg>
                ) : status === 'processing' ? (
                    <svg className="w-10 h-10 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                ) : status === 'speaking' ? (
                    <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd"></path></svg>
                ) : (
                    <span className="text-4xl text-brand-900">🎙️</span>
                )}
            </button>
        </div>
    );
};

export default VoiceModeModal;
