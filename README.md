# build-2611-05 · 시험 데이터 비교 보고서

생성형 AI 업무자동화 전문가과정 **2차수** 수강생 프로젝트 05 — 기획 Hyunwoo Park.

**바로 쓰기: https://aebonlee.github.io/build-2611-05/**

차량 시험 raw data(CSV·엑셀)를 올리면 조건 구간(예: 차속 0→30 km/h 가속)의 가속 시간·평균 부하율·연비를 한 번에 계산합니다.
레퍼런스 구간을 고르면 다른 데이터에서 페달·부하율·회전수 패턴이 닮은 구간을 찾아 유사성 지표(회전수 구간별 부하율 차이·상관계수)로 비교하고,
유사 여부를 직접 확인한 뒤 그래프가 들어간 보고서(인쇄·엑셀)를 만듭니다.
파일은 브라우저 안에서만 처리하며 서버로 올라가지 않습니다.

| 파일 | 역할 |
|---|---|
| `js/engine.js` | 계산 엔진(읽기·열 매핑·구간·지표·탐색·판정·확인 조건) — 판정은 전부 여기 |
| `js/app.js` | 화면 |
| `test/logic.test.js` | 계산 규칙 테스트 `node test/logic.test.js` |
| `test/smoke.browser.js` | 화면 연기 테스트(playwright) |
| `CLAUDE.md` | 작업 지시서 + 기획서 원문 |

예제 데이터는 실제 사내 데이터가 아닙니다(가짜 수소엔진 차량 가속 시험 3개).

## 기획서 · 버전

- 사이트 「기획서」 페이지: https://aebonlee.github.io/build-2611-05/plan.html — 워드 판 내려받기
- 워드 판: `docs/기획서/build-2611-05_HyunwooPark_시험데이터비교보고서_기획서_v<버전>.docx` (버전마다 남김)
- 원본: `docs/plan.json` → 생성기 `build-2611-00/tools/plandoc/make_plan.py` 로 워드·그림·plan.html·CHANGELOG.md 를 다시 만든다
- 버전을 올릴 때: `plan.json` 의 `version` 을 바꾸고 `versions` 맨 앞에 바뀐 점을 적은 뒤 생성기를 다시 돌린다
