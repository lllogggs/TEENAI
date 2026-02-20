import React, { useState, useRef, useEffect } from 'react';

interface VoiceModeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVoiceSubmit: (audioBase64: string) => Promise<string>; // Returns AI text response
    onPlayAudio: (text: string) => Promise<void>; // Sends text to TTS and plays
}

const VoiceModeModal: React.FC<VoiceModeModalProps> = ({ isOpen, onClose, onVoiceSubmit, onPlayAudio }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        if (!isOpen) {
            stopAll();
        }
        return stopAll;
    }, [isOpen]);

    const stopAll = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { });
            audioContextRef.current = null;
        }
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
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
        ctx.strokeStyle = '#4f46e5';
        ctx.beginPath();

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * canvas.height) / 2;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();

        animationRef.current = requestAnimationFrame(drawWaveform);
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioContext = new AudioContext();
            audioContextRef.current = audioContext;
            const analyser = audioContext.createAnalyser();
            analyserRef.current = analyser;
            analyser.fftSize = 256;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            drawWaveform();

            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                setIsProcessing(true);
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Audio = reader.result as string;
                    try {
                        const aiText = await onVoiceSubmit(base64Audio);
                        await onPlayAudio(aiText);
                    } catch (e) {
                        console.error('Voice loop error:', e);
                    } finally {
                        setIsProcessing(false);
                    }
                };
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error('Failed to start recording', err);
            alert('마이크 접근 권한이 필요합니다.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
        // Clear canvas
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-brand-900/95 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
            <button onClick={onClose} className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>

            <div className="text-center mb-12">
                <div className="w-24 h-24 bg-white/10 rounded-full mx-auto flex items-center justify-center text-5xl mb-6 shadow-2xl shadow-brand-500/20">🎧</div>
                <h2 className="text-3xl font-black text-white mb-3">포틴에이아이 대화 모드</h2>
                <p className="text-brand-200 font-bold">자연스럽게 말해보세요.</p>
            </div>

            <div className="w-full max-w-md h-32 bg-brand-900/50 rounded-3xl mb-12 relative overflow-hidden flex items-center justify-center border border-white/10">
                <canvas ref={canvasRef} width={400} height={100} className="w-full h-full opacity-80" />
                {!isRecording && !isProcessing && <p className="absolute text-brand-300 font-bold text-sm">마이크 버튼을 누른 채로 말하세요</p>}
                {isProcessing && <p className="absolute text-brand-300 font-bold text-sm animate-pulse">생각 중...</p>}
            </div>

            <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={isProcessing}
                className={`w-28 h-28 rounded-full flex items-center justify-center text-4xl shadow-2xl transition-all ${isRecording ? 'bg-rose-500 shadow-rose-500/50 scale-110' : 'bg-white text-brand-900 hover:scale-105'} disabled:bg-slate-400 disabled:scale-100 disabled:shadow-none`}
            >
                🎙️
            </button>
        </div>
    );
};

export default VoiceModeModal;
