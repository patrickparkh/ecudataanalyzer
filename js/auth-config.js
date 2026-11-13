// 로그인 설정 — 이 파일 한 곳만 바꾸면 된다(생성: build-2611-00/tools/kit/apply-kit.mjs, 대문 문구 출처 docs/plan.json).
// 내 Supabase 로 옮길 때: url · anonKey 를 내 프로젝트 값으로, 카카오를 설정하지 않았으면 kakao: false. 안내 = docs/내_깃허브로_옮기기.md
// prefix 는 supabase/auth.sql 의 표 이름 앞부분과 같아야 한다.
window.AUTH_CONFIG = {
  "url": "https://hcmgdztsgjvzcyxyayaj.supabase.co",
  "anonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjbWdkenRzZ2p2emN5eHlheWFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MzU4ODcsImV4cCI6MjA4NzAxMTg4N30.gznaPzY1l8qDAPsEyYNR9KS7f7VqS3xaw-_2HTSwSZw",
  "prefix": "build261105",
  "kakao": true,
  "idleMinutes": 30,
  "localBypass": true,
  "board": true,
  "site": {
    "title": "시험 데이터 비교 보고서",
    "summary": "차량 시험 raw data(CSV·엑셀)를 올리면 조건 구간(예: 차속 0→30 km/h 가속)의 가속 시간·평균 부하율·연비를 한 번에 계산하고, 레퍼런스와 페달·부하율·회전수 패턴이 닮은 구간을 찾아 유사성 지표로 비교한 뒤, 사용자가 유사 여부를 확인하면 그래프가 들어간 보고서(인쇄·엑셀)를 만드는 도구입니다.",
    "course": "생성형 AI 업무자동화 전문가과정 · 2차수",
    "features": [
      {
        "name": "파일 읽기 · 열 매핑",
        "desc": "CSV·엑셀을 여러 개 읽고 시간·차속·페달·부하율·회전수·연료유량 열을 자동으로 고릅니다. 틀린 줄과 보간한 빈 값은 알립니다."
      },
      {
        "name": "구간 지표",
        "desc": "차속 구간 또는 채널 조건으로 구간을 뽑고 가속 시간·평균 부하율·연비 등을 표로 보여 줍니다. 계산한 값은 「계산」으로 표시합니다."
      },
      {
        "name": "유사 구간 찾기",
        "desc": "레퍼런스 구간의 페달·부하율·회전수 모양을 다른 파일 전체에 밀어 대며 가장 가까운 창 3개를 찾습니다."
      },
      {
        "name": "유사성 판정",
        "desc": "회전수 구간별 부하율 차이, 상관계수, 구간 겹침 세 기준으로 자동 판정하고 문장으로 설명합니다."
      },
      {
        "name": "사용자 확인",
        "desc": "비교마다 유사 여부를 직접 고릅니다. 후보 창을 바꾸면 다시 확인합니다."
      },
      {
        "name": "보고서 · 엑셀",
        "desc": "그래프가 들어간 화면 보고서를 인쇄·PDF로, 지표·판정·정렬 데이터를 엑셀로 냅니다. AI 소견 초안은 선택입니다."
      }
    ],
    "steps": [
      "시험 파일 올리기",
      "열 매핑 · 정리",
      "구간 추출",
      "지표 계산",
      "유사 구간 탐색",
      "유사성 판정"
    ],
    "flow": [
      {
        "step": "시험 파일 올리기",
        "desc": "CSV·엑셀 여러 개를 브라우저에서 읽음"
      },
      {
        "step": "열 매핑 · 정리",
        "desc": "채널 열 자동 추정, 시간 오류·역순 제외, 빈 값 보간"
      },
      {
        "step": "구간 추출",
        "desc": "차속 구간·채널 조건으로 시작·끝 시각을 보간해 찾음"
      },
      {
        "step": "지표 계산",
        "desc": "시간 가중 평균·거리·연료량·연비"
      },
      {
        "step": "유사 구간 탐색",
        "desc": "레퍼런스 창을 대상 전체에 밀어 대며 거리 계산"
      },
      {
        "step": "유사성 판정",
        "desc": "회전수 구간별 부하율·상관계수·겹침, 판정 문장"
      }
    ],
    "goals": [
      "사용자가 정한 조건으로 모든 파일에서 구간을 뽑고 지표를 한 번에 계산합니다.",
      "레퍼런스 구간과 닮은 구간을 다른 데이터에서 자동으로 찾습니다.",
      "회전수 구간별 부하율 차이·상관계수 같은 유사성 지표와 판정 문장을 제시합니다."
    ],
    "screen": "docs/img/screen.png",
    "plan": "plan.html",
    "report": "report.html",
    "home": true,
    "guide": {
      "screens": [],
      "data": [
        {
          "name": "시험 파일(CSV·엑셀)",
          "fields": "시간 · 차속 · 페달 · 부하율 · 엔진회전수 · 연료유량"
        },
        {
          "name": "구간 조건",
          "fields": "차속 시작·끝·출발 판정 / 채널·비교·값·최소 지속"
        },
        {
          "name": "판정 기준",
          "fields": "부하율 허용 차이(%p) · 상관계수 최소 · 구간 겹침 최소 · 회전수 구간 폭"
        },
        {
          "name": "내보내기",
          "fields": "구간지표 · 유사도판정 · 회전수구간_부하율 · 정렬_<파일>"
        }
      ],
      "rules": [
        "차속 구간 시작은 시작값을 지나는 순간(0 이면 출발 판정 0.5 km/h), 끝은 끝값에 처음 닿는 순간 — 샘플 사이 직선 보간.",
        "끝값에 닿기 전에 다시 시작값 아래로 내려가면 그 시도는 버립니다.",
        "평균은 시간 가중(사다리꼴 적분 ÷ 구간 시간). 연비 = ∫차속 dt ÷ ∫연료유량 dt.",
        "탐색 정규화는 레퍼런스 구간의 최소~최대 — 부하율이 통째로 높아진 차이도 드러납니다.",
        "판정: 부하율 차이 최대 ≤ ±5%p · 상관계수 최소 ≥ 0.9 · 회전수 구간 겹침 ≥ 80% 모두 만족이면 유사.",
        "모든 비교의 유사 여부를 사용자가 골라야 보고서를 만듭니다."
      ],
      "limits": [
        "기획2(수천 쪽 제어기 매뉴얼 기반 고장 진단)는 대용량 문서 RAG라 이번 판 범위 밖이며 DAY4 실습에서 축소판으로 다룹니다.",
        "속도가 다른 시험을 시간 축으로 늘이고 줄여 맞추기(DTW)는 하지 않습니다 — 같은 길이 창끼리 비교합니다.",
        "계측 장비 원본 형식(MDF·BLF 등)은 읽지 않습니다 — CSV·엑셀로 내보내 올립니다."
      ],
      "users": [
        "엔진·차량 캘리브레이션 엔지니어",
        "시험·평가 담당자"
      ],
      "flow": [
        {
          "step": "시험 파일 올리기",
          "desc": "CSV·엑셀 여러 개를 브라우저에서 읽음"
        },
        {
          "step": "열 매핑 · 정리",
          "desc": "채널 열 자동 추정, 시간 오류·역순 제외, 빈 값 보간"
        },
        {
          "step": "구간 추출",
          "desc": "차속 구간·채널 조건으로 시작·끝 시각을 보간해 찾음"
        },
        {
          "step": "지표 계산",
          "desc": "시간 가중 평균·거리·연료량·연비"
        },
        {
          "step": "유사 구간 탐색",
          "desc": "레퍼런스 창을 대상 전체에 밀어 대며 거리 계산"
        },
        {
          "step": "유사성 판정",
          "desc": "회전수 구간별 부하율·상관계수·겹침, 판정 문장"
        },
        {
          "step": "사용자 확인",
          "desc": "비교마다 유사함 / 유사하지 않음 선택"
        },
        {
          "step": "보고서",
          "desc": "인쇄 HTML(그래프)·엑셀 내보내기"
        }
      ]
    },
    "landing": {
      "company": {
        "name": "HD건설기계",
        "en": "HD CONSTRUCTION EQUIPMENT",
        "logo": "images/logo.png",
        "logoH": 24
      },
      "slides": [
        {
          "image": "images/slide-1.jpg",
          "tone": "dark"
        },
        {
          "image": "images/slide-2.jpg",
          "tone": "dark"
        },
        {
          "image": "images/slide-3.jpg",
          "tone": "dark"
        }
      ],
      "heroMode": "slide",
      "headline": "ECU Data Analyzer",
      "lead": "Raw Data 분석 · 가속성, 부하율, 연비 계산 · 다중 데이터 구간의 유사도 분석 · 데이터 시각화 보고서 생성"
    }
  }
};
