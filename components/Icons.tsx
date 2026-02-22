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

// -----------------------------------------------------------------------------
// Animal Mentors Icons
// -----------------------------------------------------------------------------

export const CatIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        <path d="M5 3L8 7H16L19 3V9C19 14.5 16 19 12 19C8 19 5 14.5 5 9V3Z" />
        <circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <path d="M12 14.5C11.5 15.5 10.5 16 9.5 15.5" />
        <path d="M12 14.5C12.5 15.5 13.5 16 14.5 15.5" />
    </svg>
);

export const DogIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        <path d="M10 5.17C10 3.78 8.42 2.68 6.5 3c-2.82.47-4.11 2.54-4 4 .19 2.44 1.5 5 5.5 5h8c4 0 5.31-2.56 5.5-5 .11-1.46-1.18-3.53-4-4-1.92-.32-3.5 1.18-3.5 2.57V6a2 2 0 01-2 2h-2a2 2 0 01-2-2v-.83z" />
        <circle cx="8.5" cy="14.5" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="14.5" r="1.5" fill="currentColor" stroke="none" />
        <path d="M12 18v1" />
    </svg>
);

export const RabbitIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        <path d="M13 5a3 3 0 0 0-6 0v5a3 3 0 0 0 6 0V5z" />
        <path d="M17 5a3 3 0 0 0-6 0v5a3 3 0 0 0 6 0V5z" />
        <circle cx="12" cy="16" r="6" />
        <circle cx="10" cy="15" r="1" fill="currentColor" stroke="none" />
        <circle cx="14" cy="15" r="1" fill="currentColor" stroke="none" />
        <path d="M12 18v1" />
    </svg>
);

export const BearIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        <circle cx="12" cy="13" r="7" />
        <circle cx="6.5" cy="7.5" r="2.5" />
        <circle cx="17.5" cy="7.5" r="2.5" />
        <path d="M12 16v1" />
        <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
);

export const HamsterIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        <ellipse cx="12" cy="14" rx="8" ry="6" />
        <path d="M7 10C7 7.5 9.5 6 12 6s5 1.5 5 4" />
        <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
        <path d="M12 14v1" />
    </svg>
);

export const FoxIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        <path d="M4 4l4 5 4-2 4 2 4-5v8a8 8 0 0 1-16 0V4z" />
        <circle cx="9" cy="13" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="15" cy="13" r="1.5" fill="currentColor" stroke="none" />
        <path d="M12 17v1" />
    </svg>
);

export const KoalaIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        <ellipse cx="12" cy="14" rx="7" ry="6" />
        <circle cx="5" cy="9" r="3.5" />
        <circle cx="19" cy="9" r="3.5" />
        <circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" />
        <ellipse cx="12" cy="15.5" rx="1.5" ry="2" fill="currentColor" stroke="none" />
    </svg>
);

export const PandaIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        <path d="M12 21A8 8 0 1 0 12 5a8 8 0 0 0 0 16z" />
        <circle cx="7" cy="6" r="3" />
        <circle cx="17" cy="6" r="3" />
        <ellipse cx="9" cy="12" rx="2" ry="2.5" fill="currentColor" stroke="none" />
        <ellipse cx="15" cy="12" rx="2" ry="2.5" fill="currentColor" stroke="none" />
        <circle cx="12" cy="16" r="1.5" fill="currentColor" stroke="none" />
    </svg>
);

export const PenguinIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        <path d="M12 3c-4.5 0-6 4.5-6 9 0 4.5 2 8 6 8s6-3.5 6-8c0-4.5-1.5-9-6-9z" />
        <circle cx="9.5" cy="10" r="1" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="10" r="1" fill="currentColor" stroke="none" />
        <path d="M11 13l1 2 1-2H11z" fill="currentColor" stroke="none" />
    </svg>
);

export const ChickIcon: React.FC<IconProps> = ({ size = 24, className = '', ...props }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        <circle cx="12" cy="14" r="7" />
        <path d="M12 7c-2 0-3.5 1.5-3.5 3.5" />
        <circle cx="9.5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="12" r="1" fill="currentColor" stroke="none" />
        <path d="M11 15l1 2 1-2H11z" fill="currentColor" stroke="none" />
    </svg>
);

export const AnimalIcons = [
    CatIcon,
    DogIcon,
    RabbitIcon,
    BearIcon,
    HamsterIcon,
    FoxIcon,
    KoalaIcon,
    PandaIcon,
    PenguinIcon,
    ChickIcon,
];
