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
}

export interface AISettings {
  // Core Safeguards (Essentials)
  toneType: 'gentle' | 'logical' | 'casual';
  strictSafety: boolean; 
  eduMode: boolean; 
  socialBalance: boolean; 
  cleanLanguage: boolean; 

  // Detailed Settings
  lateNightLimit: boolean; 
  curiosityMode: boolean; 
  criticalThinking: boolean; 
  praiseIntensity: 'normal' | 'high'; 
  interestTopic: string; 
  
  // Updated: Multiple Parent Directives
  parentDirectives: string[]; // 학부모가 직접 입력하는 추가 지시사항 리스트
}

export interface StudentProfile {
  userId: string;
  inviteCode: string;
  parentUserId?: string;
  settings?: AISettings;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  studentId: string;
  shareMode: boolean;
  startedAt: number;
  endedAt?: number;
  messages: ChatMessage[];
  topicTags: string[];
  outputTypes: string[];
  toneLevel: ToneLevel;
  summary?: string;
  studentIntent?: string;
  aiIntervention?: string;
}

export interface SafetyAlert {
  id: string;
  studentId: string;
  sessionId: string;
  createdAt: number;
  message: string;
  read: boolean;
}

export interface AnalysisResult {
  topic_tags: string[];
  output_types: string[];
  tone_level: 'low' | 'medium' | 'high';
  session_summary: string;
  student_intent: string;
  ai_intervention: string;
}