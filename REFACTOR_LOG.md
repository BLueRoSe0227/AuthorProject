# Storyweaver 리팩터링 기록

전체 코드베이스 점검(버그 수정 + 죽은 코드 제거 + 리팩터링) 세션의 작업 기록입니다. 세션이 반복될 때마다 **아래에 새 항목을 추가**하는 방식으로 누적 관리합니다 (기존 항목은 삭제하지 않음).

---

## 2026-08-02 — 맞춤법 검사 줄바꿈 버그 + 전체 코드 점검

### 🐛 핵심 버그: 맞춤법 검사 마크가 표시되면 문단이 줄바꿈되는 문제

**증상**: 맞춤법 검사를 돌리면 표시된(밑줄 그어진) 단어들이 원래 문장 흐름에서 떨어져 나와 각자 자기만의 줄에 홀로 표시됨.

**원인**: `js/proofreader.js`의 `offsetToNodeOffset`는 `contentEl.textContent`(문단 `<div>` 경계에 아무 구분자도 넣지 않고 이어붙인 문자열) 기준의 평면 오프셋을 실제 텍스트 노드 위치로 변환하는 함수였습니다. 오프셋이 정확히 두 문단의 경계에 걸치면(예: 새 문단의 첫 글자부터 시작하는 매칭), "이전 노드의 끝"과 "다음 노드의 시작"이 평면 오프셋 공간에서는 구분되지 않지만 실제로는 서로 다른 `<div>`에 속합니다. 기존 코드는 이 경계를 항상 "이전 노드의 끝" 쪽으로 해석했는데, 이게 **Range의 시작(start) 계산에도 그대로 적용되면서** Range가 한 문단에서 시작해 다음 문단에서 끝나는 상황이 발생했습니다. 이런 Range를 `surroundContents`/`extractContents`로 감싸려고 하면 문단 `<div>`가 복제·분할되며 DOM이 깨지고, 그 결과 표시된 단어가 별도의 줄로 떨어져 나갔습니다.

**수정**: `offsetToNodeOffset`에 `preferNextNode` 매개변수를 추가해 경계 모호성을 해소하는 방향을 시작/끝에 따라 다르게 선택하도록 함 — 시작(start)은 항상 "다음 노드의 시작"으로, 끝(end)은 항상 "이전 노드의 끝"으로 스냅. 이러면 문단 경계에 걸친 매칭이 항상 하나의 문단 안에 깔끔하게 들어감.

**검증**: 실제 Playwright 브라우저에서 재현 스크립트로 확인, `tests/proofreader.test.js`에 회귀 테스트 추가(다중 문단 경계 시나리오).

- 파일: `js/proofreader.js`

---

### 🐛 함께 발견/수정한 버그

| 버그 | 파일 | 내용 |
|---|---|---|
| 미션(스트릭) 진행률 오표시 | `js/models.js` (`getMissionProgress`) | 오늘 목표를 아직 채우지 못한 시점엔 대시보드의 "🔥 연속 N일"과 모순되게 스트릭이 0으로 표시됨. `getWritingStreak`에 이미 있던 "오늘 미달성 시 어제부터 카운트" 보정이 미션 진행률 계산엔 빠져 있었음 — 동일하게 적용해 수정. |
| 작품 삭제 시 데이터 잔존 | `js/models.js` (`deleteWork`) | `missions`, `researchPosts` 스토어가 정리 목록에서 빠져 있어, 작품을 삭제해도 관련 미션/자료가 영구히 남아 이후 모든 백업 내보내기에 포함됨. |
| 화면 전환 시 리소스 누수 (3건) | `js/graph.js`, `js/router.js`, `js/views/dashboard.js`, `js/views/characters.js`, `js/views/manuscript.js`, `js/views/research.js` | 대시보드 관계망 그래프(`Graph.mount`)의 `requestAnimationFrame` 물리 루프 + `window` 리스너, 캐릭터 관계도(`Graph.mountRelationshipMap`)의 `window` 리스너, 원고/자료 수집 에디터(`RichEditor.mount`)의 `document` `selectionchange` 리스너가 화면을 벗어나도 계속 실행됨. `Router`에 `onCleanup(fn)` 공용 훅을 추가해 라우트 전환 시 자동으로 정리되도록 함. Playwright로 실제로 루프가 멈추는지 rAF 카운터로 검증. |
| 캐릭터 삭제 시 불필요한 전체 스캔 | `js/models.js` (`deleteCharacter`) | 이미 삭제된 id로 재호출되면(중복 클릭 등) `workId`가 `undefined`가 되어 전체 캐릭터 스토어를 훑는 경로를 탐. 존재 확인 후 조기 반환하도록 수정. |

---

### 🧹 제거한 죽은 코드

- `Proofreader.applyFix` (`js/proofreader.js`) — 어디서도 호출되지 않음. 인라인 마킹 방식(`applyMark`)으로 교체된 뒤 남은 이전 구현. 관련 테스트 3개도 함께 제거.
- `Utils.renderContentHtml` (`js/utils.js`) — 호출부 없음.
- `Utils.uid` (`js/utils.js`) — 호출부 없음. 모든 id 생성은 `DB.uuid()` 사용.
- `Graph.mount`의 사용되지 않는 `moved` 변수 계산 — 결과를 어디서도 읽지 않던 코드.

---

### ♻️ 리팩터링

- **월별 달력 렌더링 통합** — 홈 대시보드(`js/views/home.js`)와 작품별 목표&일정(`js/views/goals.js`)에 거의 동일하게 중복돼 있던 달력 그리드 렌더링(~75줄, 요일 헤더/월 계산/다중일 이벤트 전개 로직까지 동일)을 `Utils.renderMonthCalendar(container, cursor, events, { renderEvent })` 공용 함수로 통합. 이벤트 칩의 색상/툴팁/클릭 동작만 호출부에서 다르게 정의.
- **색상 선택기 통합** — 작품 생성 모달과 캐릭터 그룹 모달에 중복돼 있던 색상 스와치 선택 UI를 `Views.renderColorSwatches`/`Views.bindColorSwatches`로 통합 (기존 `renderLengthRadioGroup`/`bindLengthRadioGroup` 패턴과 동일한 스타일).

### ✅ 검증
- `node --check`로 전체 JS 파일 문법 검사
- `npx vitest run` — 59개 테스트 전체 통과
- Playwright 실브라우저 검증: 다중 문단 맞춤법 마킹, 색상 스와치 선택(작품/그룹 양쪽), 홈/작품별 달력 렌더링·월 이동, 여러 라우트 연속 이동 시 콘솔 에러 없음, rAF 루프가 화면 전환 후 실제로 멈추는지 카운터로 확인
