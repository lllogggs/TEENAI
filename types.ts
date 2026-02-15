export enum UserRole {
  STUDENT = 'student',
  PARENT = 'parent'
}

export enum ToneLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

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
    block_inappropriate?: boolean;
    self_directed?: boolean;
    anti_overuse?: boolean;
    language_filter?: boolean;
    block_harmful?: boolean;
  };
  mentor_tone?: 'warm' | 'rational' | 'friendly';
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
  id?: string;
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
  started_at: string;
  last_message_at?: string;
  topic_tags: string[];
  output_types: string[];
  tone_level: ToneLevel;
  session_summary?: string;
  summary?: string;
  stability_label?: 'stable' | 'normal' | 'caution';
  stability_reason?: string;
  student_intent?: string;
  ai_intervention?: string;
}
