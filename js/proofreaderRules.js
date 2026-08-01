// Curated 국립국어원 어문규범(맞춤법/띄어쓰기) rule set for Proofreader (js/proofreader.js).
//
// This project has no morphological analyzer, so rules are deliberately scoped to
// substring patterns that are almost always wrong regardless of context (e.g. "됬"
// never a correct spelling) rather than attempting general spellcheck, which would
// need real tokenization and would false-positive constantly on dialogue, character
// names, and neologisms. Genuinely context-dependent pairs (안 되다/안되다, 로서/로써)
// are listed with `fix: null` — they're surfaced with an explanation but never
// auto-replaced, since guessing wrong there would silently corrupt the author's text.
const ProofreaderRules = [
  // ---- 맞춤법: 항상 틀린 표기 (안전하게 자동 치환 가능) ----
  { id: 'doeot', category: 'spelling', pattern: /됬/g, message: '"됬"은 없는 표기입니다. "되다"의 과거형은 "됐"입니다.', fix: () => '됐', dictWord: '되다' },
  { id: 'wenji', category: 'spelling', pattern: /웬지/g, message: '"왠지"가 표준 표기입니다. ("왜인지"의 준말)', fix: () => '왠지', dictWord: '왠지' },
  { id: 'waenil', category: 'spelling', pattern: /왠일/g, message: '"웬일"이 표준 표기입니다.', fix: () => '웬일', dictWord: '웬일' },
  { id: 'waenman', category: 'spelling', pattern: /왠만/g, message: '"웬만"이 표준 표기입니다. (웬만하면/웬만한 등)', fix: () => '웬만', dictWord: '웬만하다' },
  { id: 'eotteokhae', category: 'spelling', pattern: /어떻해/g, message: '"어떡해"("어떻게 해"의 준말)가 표준 표기입니다.', fix: () => '어떡해', dictWord: '어떡해' },
  { id: 'myeochil', category: 'spelling', pattern: /몇일/g, message: '"며칠"이 표준 표기입니다.', fix: () => '며칠', dictWord: '며칠' },
  { id: 'oraetman', category: 'spelling', pattern: /오랫만/g, message: '"오랜만"이 표준 표기입니다.', fix: () => '오랜만', dictWord: '오랜만' },
  { id: 'seolleim', category: 'spelling', pattern: /설레임/g, message: '"설렘"이 표준 표기입니다. (설레다 → 설렘)', fix: () => '설렘', dictWord: '설렘' },
  { id: 'seollei', category: 'spelling', pattern: /설레이/g, message: '"설레다"에는 "이"가 들어가지 않습니다.', fix: () => '설레', dictWord: '설레다' },
  { id: 'samgaha', category: 'spelling', pattern: /삼가하/g, message: '"삼가다"가 표준 표기입니다. ("삼가하다"는 잘못된 표기)', fix: () => '삼가', dictWord: '삼가다' },
  { id: 'samgahae', category: 'spelling', pattern: /삼가해/g, message: '"삼가다"가 표준 표기입니다. ("삼가해 주세요" → "삼가 주세요")', fix: () => '삼가', dictWord: '삼가다' },
  { id: 'seoseumchi', category: 'spelling', pattern: /서슴치/g, message: '"서슴지"가 표준 표기입니다. (서슴다 → 서슴지)', fix: () => '서슴지', dictWord: '서슴다' },
  { id: 'anseureop1', category: 'spelling', pattern: /안스럽/g, message: '"안쓰럽다"가 표준 표기입니다.', fix: () => '안쓰럽', dictWord: '안쓰럽다' },
  { id: 'anseureop2', category: 'spelling', pattern: /안스러/g, message: '"안쓰럽다"가 표준 표기입니다.', fix: () => '안쓰러', dictWord: '안쓰럽다' },
  { id: 'neolbureo', category: 'spelling', pattern: /널부러지/g, message: '"널브러지다"가 표준 표기입니다.', fix: () => '널브러지', dictWord: '널브러지다' },
  { id: 'yukgaejang', category: 'spelling', pattern: /육계장/g, message: '"육개장"이 표준 표기입니다.', fix: () => '육개장', dictWord: '육개장' },
  { id: 'dwichidakgeori', category: 'spelling', pattern: /뒤치닥거리/g, message: '"뒤치다꺼리"가 표준 표기입니다.', fix: () => '뒤치다꺼리', dictWord: '뒤치다꺼리' },
  { id: 'huian', category: 'spelling', pattern: /희안하/g, message: '"희한하다"가 표준 표기입니다.', fix: () => '희한하', dictWord: '희한하다' },
  { id: 'nangtteoreoji', category: 'spelling', pattern: /낭떨어지/g, message: '"낭떠러지"가 표준 표기입니다.', fix: () => '낭떠러지', dictWord: '낭떠러지' },
  { id: 'gungsireong', category: 'spelling', pattern: /궁시렁/g, message: '"구시렁"이 표준 표기입니다. (구시렁거리다)', fix: () => '구시렁', dictWord: '구시렁거리다' },
  { id: 'doemulrim', category: 'spelling', pattern: /되물림/g, message: '"대물림"이 표준 표기입니다.', fix: () => '대물림', dictWord: '대물림' },
  { id: 'tongchae', category: 'spelling', pattern: /통채로/g, message: '"통째로"가 표준 표기입니다.', fix: () => '통째로', dictWord: '통째로' },
  { id: 'aesung', category: 'spelling', pattern: /애숭이/g, message: '"애송이"가 표준 표기입니다.', fix: () => '애송이', dictWord: '애송이' },
  { id: 'hamateumyeon', category: 'spelling', pattern: /하마트면/g, message: '"하마터면"이 표준 표기입니다.', fix: () => '하마터면', dictWord: '하마터면' },
  { id: 'gopbaegi', category: 'spelling', pattern: /곱배기/g, message: '"곱빼기"가 표준 표기입니다.', fix: () => '곱빼기', dictWord: '곱빼기' },
  { id: 'odobangjeong', category: 'spelling', pattern: /오도방정/g, message: '"오두방정"이 표준 표기입니다.', fix: () => '오두방정', dictWord: '오두방정' },
  { id: 'boeyo', category: 'spelling', pattern: /뵈요/g, message: '"봬요"("뵈어요"의 준말)가 표준 표기입니다.', fix: () => '봬요', dictWord: '뵙다' },

  // ---- 띄어쓰기: 의존명사/보조용언 (흔하고 안전한 패턴만) ----
  { id: 'halsu-it', category: 'spacing', pattern: /할수있/g, message: '의존명사 "수"는 앞말과 띄어 씁니다.', fix: () => '할 수 있', dictWord: null },
  { id: 'halsu-eop', category: 'spacing', pattern: /할수없/g, message: '의존명사 "수"는 앞말과 띄어 씁니다.', fix: () => '할 수 없', dictWord: null },
  { id: 'geotgat', category: 'spacing', pattern: /것같/g, message: '"것"과 "같다"는 띄어 씁니다.', fix: () => '것 같', dictWord: null },
  { id: 'geogat', category: 'spacing', pattern: /거같/g, message: '"거"(것의 구어체)와 "같다"는 띄어 씁니다.', fix: () => '거 같', dictWord: null },
  { id: 'bakkeeop', category: 'spacing', pattern: /밖에없/g, message: '조사 "밖에"와 "없다"는 띄어 씁니다.', fix: () => '밖에 없', dictWord: null },
  { id: 'ppunman', category: 'spacing', pattern: /뿐만아니라/g, message: '"뿐만"과 "아니라"는 띄어 씁니다.', fix: () => '뿐만 아니라', dictWord: null },

  // ---- 문맥 의존형: 자동 치환은 위험해 설명만 제공 ----
  { id: 'an-doe', category: 'expression', pattern: /안되|안돼/g, message: '"안되다"(한 단어, 형편이 좋지 않다/애처롭다)와 "안 되다"(부정, 가능/허용되지 않는다)는 뜻이 다릅니다. 문맥을 확인하고 필요하면 띄어 쓰세요.', fix: null, dictWord: null },
  { id: 'roseo-rosseo', category: 'expression', pattern: /(으로서|으로써)/g, message: '"로서"는 자격·지위(예: 학생으로서), "로써"는 수단·도구(예: 대화로써)를 나타냅니다. 뜻에 맞는지 확인하세요.', fix: null, dictWord: null },
  { id: 'deonji-doubled', category: 'expression', pattern: /(\S{1,12})던지(\s*)(\S{1,12})던지/g, message: '나열/선택을 뜻할 때는 "든지"가 표준입니다. ("가던지 말던지"가 아니라 "가든지 말든지")', fix: (m) => `${m[1]}든지${m[2]}${m[3]}든지`, dictWord: null },
];
