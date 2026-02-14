
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
  my_invite_code?: string; // 학부모용 초대 코드
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

export interface StudentProfile {
  user_id: string;
  invite_code: string;
  parent_user_id?: string;
  settings?: AISettings;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface SafetyAlert {
  id: string;
  student_id: string;
  session_id: string;
  created_at: number;
  message: string;
  read: boolean;
}

export interface ChatSession {
  id: string;
  student_id: string;
  share_mode: boolean;
  started_at: number;
  ended_at?: number;
  messages: ChatMessage[];
  topic_tags: string[];
  output_types: string[];
  tone_level: ToneLevel;
  summary?: string;
  student_intent?: string;
  ai_intervention?: string;
}

export interface AnalysisResult {
  topic_tags: string[];
  output_types: string[];
  tone_level: 'low' | 'medium' | 'high';
  session_summary: string;
  student_intent: string;
  ai_intervention: string;
}
