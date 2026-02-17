export enum UserRole {
  STUDENT = 'student',
  PARENT = 'parent'
}

export enum ToneLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export type SessionRiskLevel = 'stable' | 'normal' | 'caution';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  avatar_url?: string;
  my_invite_code?: string;
}

export interface StudentSettings {
  guardrails?: {
    sexual_block?: boolean;
    self_directed_mode?: boolean;
    overuse_prevent?: boolean;
    clean_language?: boolean;
    block_harmful?: boolean;
    self_directed?: boolean;
    anti_overuse?: boolean;
    language_filter?: boolean;
  };
  mentor_tone?: 'kind' | 'rational' | 'friendly';
  mentor_style?: 'kind' | 'rational' | 'friendly';
  parent_instructions?: string[];
  ai_style_prompt?: string;
  [key: string]: unknown;
}

export interface StudentProfile {
  user_id: string;
  invite_code: string;
  parent_user_id?: string;
  settings?: StudentSettings;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface MessageRow {
  id: string;
  session_id: string;
  student_id: string;
  role: 'user' | 'model';
  content: string;
  created_at: string;
}

export interface SafetyAlert {
  id: string;
  student_id: string;
  created_at: string;
  message: string;
}

export interface ChatSession {
  id: string;
  student_id: string;
  title: string;
  started_at: string;
  topic_tags: string[];
  output_types: string[];
  tone_level: ToneLevel;
  student_intent?: string;
  ai_intervention?: string;
  risk_level?: SessionRiskLevel;
}


export interface AISettings {
  toneType: 'gentle' | 'logical' | 'casual';
  strictSafety: boolean;
  eduMode: boolean;
  socialBalance: boolean;
  cleanLanguage: boolean;
  lateNightLimit: boolean;
  curiosityMode: boolean;
  criticalThinking: boolean;
  praiseIntensity: 'normal' | 'high';
  interestTopic: string;
  parentDirectives: string[];
}
