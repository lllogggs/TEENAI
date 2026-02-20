// Danger keywords for the prototype rule-based filter
export const DANGER_KEYWORDS = [
  'kill myself',
  'suicide',
  'die',
  'hurt myself',
  'end my life',
  'cut myself',
  'blood',
  'overdose',
  '죽고싶다',
  '자살',
  '자해',
  '목숨',
  '죽어버릴',
  '뛰어내릴',
  '칼로',
  '피가',
  '죽을래',
  '사라지고 싶다',
  '손목'
];

export const SAFETY_ALERT_MESSAGE = `[ForTen AI 안전 알림]
자녀의 대화 중 심리적 불안이나 안전이 우려되는 표현이 감지되었습니다.
자녀분과 따뜻한 대화를 나눠보시길 권장드립니다.
(자녀의 프라이버시를 위해 대화 원문은 제공되지 않습니다)`;

export const MOCK_GEN_MODEL = 'gemini-2.5-flash';
export const MOCK_ANALYSIS_MODEL = 'gemini-2.5-flash'; // Efficient for JSON tasks