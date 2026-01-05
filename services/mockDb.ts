import { User, UserRole, ChatSession, SafetyAlert, StudentProfile, ToneLevel, AISettings } from '../types';

const STORAGE_KEYS = {
  USERS: 'teenai_users',
  PROFILES: 'teenai_profiles',
  SESSIONS: 'teenai_sessions',
  ALERTS: 'teenai_alerts',
  PENDING_INVITES: 'teenai_pending_invites'
};

const DEFAULT_SETTINGS: AISettings = {
  toneType: 'gentle',
  strictSafety: true,
  eduMode: true,
  socialBalance: true,
  cleanLanguage: true,
  lateNightLimit: true,
  curiosityMode: false,
  criticalThinking: true,
  praiseIntensity: 'high',
  interestTopic: '',
  parentDirectives: ["우리 아이가 요즘 진로 고민이 많은데, 관련된 대화를 할 때 따뜻하게 격려 부탁드려요."]
};

interface PendingInvite {
  code: string;
  parentUserId: string;
}

const generateId = () => Math.random().toString(36).substr(2, 9);
const generateCode = () => Math.random().toString(36).substr(2, 6).toUpperCase();

const seedTestData = () => {
  const users: User[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
  const testEmail = 'TEST@TEST.COM';

  // 1. 테스트 학부모 생성
  let parent = users.find(u => u.email === testEmail && u.role === UserRole.PARENT);
  if (!parent) {
    parent = { id: 'test_parent_id', email: testEmail, role: UserRole.PARENT, name: '테스트학부모' };
    users.push(parent);
  }

  // 2. 테스트 학생 생성
  let student = users.find(u => u.email === testEmail && u.role === UserRole.STUDENT);
  if (!student) {
    student = { id: 'test_student_id', email: testEmail, role: UserRole.STUDENT, name: '테스트학생' };
    users.push(student);
  }
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));

  // 3. 테스트 프로필(연동) 생성
  const profiles: StudentProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES) || '[]');
  if (!profiles.find(p => p.userId === student!.id)) {
    profiles.push({
      userId: student!.id,
      inviteCode: 'TEST66',
      parentUserId: parent!.id,
      settings: DEFAULT_SETTINGS
    });
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
  }

  // 4. 샘플 세션 데이터 생성 (학부모 리포트 확인용)
  const sessions: ChatSession[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
  if (sessions.filter(s => s.studentId === student!.id).length === 0) {
    const sampleSessions: ChatSession[] = [
      {
        id: 'sample_1',
        studentId: student!.id,
        shareMode: true,
        startedAt: Date.now() - 172800000, // 2일 전
        endedAt: Date.now() - 172700000,
        messages: [
          { role: 'user', text: '요즘 공부가 너무 하기 싫어요.', timestamp: Date.now() - 172800000 },
          { role: 'model', text: '공부가 손에 잡히지 않을 때가 있죠. OO님, 무엇이 마음을 무겁게 만드나요?', timestamp: Date.now() - 172750000 }
        ],
        topicTags: ['학업 스트레스', '의욕 저하'],
        outputTypes: ['정서 지원'],
        toneLevel: ToneLevel.MEDIUM,
        summary: '학업에 대한 부담감으로 인해 번아웃 증상을 보임. 정서적 환기가 필요한 시점입니다.',
        studentIntent: '학업 스트레스 해소 및 공감 요청',
        aiIntervention: '학생의 감정을 수용하고 작은 목표부터 시작하도록 격려했습니다.'
      },
      {
        id: 'sample_2',
        studentId: student!.id,
        shareMode: true,
        startedAt: Date.now() - 86400000, // 1일 전
        endedAt: Date.now() - 86300000,
        messages: [
          { role: 'user', text: '친구랑 싸웠는데 어떻게 사과해야 할지 모르겠어요.', timestamp: Date.now() - 86400000 },
          { role: 'model', text: '먼저 다가가고 싶은 마음이 정말 예뻐요. 진심을 전하는 방법을 함께 찾아볼까요?', timestamp: Date.now() - 86350000 }
        ],
        topicTags: ['교우 관계', '사과하는 법'],
        outputTypes: ['사회성 기술'],
        toneLevel: ToneLevel.LOW,
        summary: '친구와의 갈등을 해결하고자 하는 적극적인 의지를 보임. 긍정적인 사회성 발달 단계입니다.',
        studentIntent: '대인관계 갈등 해결 가이드 요청',
        aiIntervention: '상대방의 입장을 생각해보는 질문을 통해 공감 능력을 유도했습니다.'
      }
    ];
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify([...sessions, ...sampleSessions]));
  }
};

const initDb = () => {
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.PENDING_INVITES, JSON.stringify([]));
  }
  seedTestData();
};

initDb();

export const MockDb = {
  validateInviteCode: (code: string): string | null => {
    const invites: PendingInvite[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_INVITES) || '[]');
    const invite = invites.find(i => i.code === code);
    if (invite) return invite.parentUserId;
    if (code === 'TEST66') return 'test_parent_id';
    return null;
  },

  registerStudent: async (email: string, inviteCode: string): Promise<User | null> => {
    const parentId = MockDb.validateInviteCode(inviteCode);
    if (!parentId) return null;

    const users: User[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
    let user = users.find(u => u.email === email && u.role === UserRole.STUDENT);

    if (!user) {
      user = { id: generateId(), email, role: UserRole.STUDENT, name: email.split('@')[0] };
      users.push(user);
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    }

    const profiles: StudentProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES) || '[]');
    let profile = profiles.find(p => p.userId === user!.id);
    
    if (!profile) {
      profile = { userId: user.id, inviteCode: inviteCode, parentUserId: parentId, settings: DEFAULT_SETTINGS };
      profiles.push(profile);
    } else {
      profile.parentUserId = parentId;
    }
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    return user;
  },

  updateStudentSettings: async (studentId: string, settings: AISettings) => {
    const profiles: StudentProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES) || '[]');
    const idx = profiles.findIndex(p => p.userId === studentId);
    if (idx !== -1) {
      profiles[idx].settings = settings;
      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
    }
  },

  loginParent: async (email: string): Promise<User> => {
    const users: User[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
    let user = users.find(u => u.email === email && u.role === UserRole.PARENT);
    if (!user) {
      user = { id: generateId(), email, role: UserRole.PARENT, name: email.split('@')[0] };
      users.push(user);
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    }
    return user;
  },

  createInviteCode: async (parentUserId: string): Promise<string> => {
    const code = generateCode();
    const invites: PendingInvite[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_INVITES) || '[]');
    invites.push({ code, parentUserId });
    localStorage.setItem(STORAGE_KEYS.PENDING_INVITES, JSON.stringify(invites));
    return code;
  },

  getOpenInvites: (parentUserId: string): string[] => {
    const invites: PendingInvite[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_INVITES) || '[]');
    return invites.filter(i => i.parentUserId === parentUserId).map(i => i.code);
  },

  getStudentProfile: (userId: string): StudentProfile | undefined => {
    const profiles: StudentProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES) || '[]');
    return profiles.find(p => p.userId === userId);
  },

  getConnectedStudents: (parentUserId: string): (User & { profile: StudentProfile })[] => {
    const profiles: StudentProfile[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES) || '[]');
    const users: User[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
    
    const myStudents = profiles.filter(p => p.parentUserId === parentUserId);
    return myStudents.map(p => {
      const u = users.find(user => user.id === p.userId);
      return u ? { ...u, profile: p } : null;
    }).filter(Boolean) as (User & { profile: StudentProfile })[];
  },

  saveSession: async (session: ChatSession) => {
    const sessions: ChatSession[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
    sessions.push(session);
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  },

  getStudentSessions: (studentId: string): ChatSession[] => {
    const sessions: ChatSession[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]');
    return sessions.filter(s => s.studentId === studentId).sort((a, b) => b.startedAt - a.startedAt);
  },

  createAlert: async (alert: SafetyAlert) => {
    const alerts: SafetyAlert[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ALERTS) || '[]');
    alerts.push(alert);
    localStorage.setItem(STORAGE_KEYS.ALERTS, JSON.stringify(alerts));
  },

  getParentAlerts: (studentId: string): SafetyAlert[] => {
    const alerts: SafetyAlert[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.ALERTS) || '[]');
    return alerts.filter(a => a.studentId === studentId).sort((a, b) => b.createdAt - a.createdAt);
  }
};