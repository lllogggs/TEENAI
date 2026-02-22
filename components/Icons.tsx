import React from 'react';

// Common icon properties
interface IconProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string;
}

// -----------------------------------------------------------------------------
// Unified Icons for Forteen AI Chat UI
// -----------------------------------------------------------------------------

export const SparklesIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`text-brand-500 ${className}`}
        {...props}
    >
        <path d="Mm4 14l-2 2 2 2 2-2-2-2z" /> {/* Placeholder, will implement clean sparkles */}
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a4.4 4.4 0 0 1 0-8.562L8.5 2.337A2 2 0 0 0 9.937.9L11.519-5.235a4.4 4.4 0 0 1 8.562 0L21.663.9A2 2 0 0 0 23.1 2.337l1.582 6.135a4.4 4.4 0 0 1 0 8.562L23.1 18.663a2 2 0 0 0-1.437 1.437l-1.582 6.135a4.4 4.4 0 0 1-8.562 0L9.937 20.1z" />
    </svg>
);

export const TextIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`text-slate-600 ${className}`}
        {...props}
    >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <line x1="9" y1="10" x2="15" y2="10" />
        <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
);

export const ImageIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`text-slate-600 ${className}`}
        {...props}
    >
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
        <circle cx="12" cy="13" r="3" />
    </svg>
);

export const VoiceIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`text-slate-600 ${className}`}
        {...props}
    >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
);

export const StopIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`text-rose-500 ${className}`}
        {...props}
    >
        <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
    </svg>
);

// -----------------------------------------------------------------------------
// Brand Logo
// -----------------------------------------------------------------------------

export const ForteenLogo: React.FC<IconProps> = ({ size = 32, className = '', ...props }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        {...props}
    >
        <rect width="40" height="40" rx="12" fill="currentColor" className="text-brand-900" />
        <path
            d="M26 14H18C15.7909 14 14 15.7909 14 18V26"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M14 20H22"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        {/* Stylized sparkle/brain node on top right */}
        <circle cx="26" cy="14" r="2.5" fill="white" />
    </svg>
);
