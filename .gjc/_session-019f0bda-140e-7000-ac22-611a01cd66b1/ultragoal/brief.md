푸드트럭 사장님용 메뉴·매출 관리 앱 (greenfield). 승인된 ralplan 합의 계획(.gjc/_session-019f0bda-140e-7000-ac22-611a01cd66b1/plans/ralplan/019f0bda-140e-7000-ac22-611a01cd66b1/pending-approval.md, 상세 stage-03-revision.md)과 디자인 핸드오프(design_handoff_foodtruck_pos/)를 따른다.

공통 제약:
- 스택: Expo(React Native) + expo-router + TypeScript + 공유 TS 도메인 코어 + expo-sqlite(로컬 우선). PC 웹/백엔드/동기화는 M2+.
- 데이터: 주문/취소/영업세션은 append-only 불변 이벤트, 주문라인에 판매가·원가 박제(snapshot). 현재값(일/세션 집계·메뉴현황)은 fold 파생. 로컬 SQLite 단일 트랜잭션(이벤트+프로젝션+outbox).
- fold 규칙: gross=manual_total 우선·없으면 Σ(line price×qty), cost=Σ(line unit_cost×qty), net=gross−cost, void 주문 전액 제외, 메뉴순위=매출액 기준(박제 menu).
- 디자인 토큰(색 --bg #F6F2EC / --accent #E85D3A / --ink #2B2521 / --green #2F9E6B / --gold #C2912E / --danger #C9443B 등, Pretendard, 라운드 16-18, 잠금=gold lock)을 픽셀에 가깝게 재현. 휴대폰 베젤/브라우저 크롬 목업 제외.
- 무료/유료 경계: 무료=메뉴관리·POS·다중직원·당일/기본 매출. 유료=기간분석(월/연)·추이그래프·PC웹·내보내기·광고제거. entitlement seam은 M1부터 설계(전체 무료 개방), 실제 광고 SDK·구독 결제는 M4.
- 검증: 각 스토리 완료 시 타입체크 + 핵심 도메인 단위테스트(fold/원가율/박제/void) + 해당 표면 e2e.

@goal: M1 로컬 단독 — 메뉴+POS+영업세션+일매출
Expo 프로젝트 스캐폴드 + 공유 TS 도메인 코어 + expo-sqlite 로컬 저장. 구현:
- 도메인 코어(플랫폼 무관 TS): 이벤트 타입(OrderPlaced/OrderVoided/SessionOpened/SessionClosed), 원가율 계산, 레시피 재료단가 합산 원가, fold(주문+취소→일/세션 매출·원가·순이익), 박제 로직, entitlement(free|paid) 판정 seam.
- 로컬 저장: expo-sqlite, 이벤트 append-only 테이블 + 마스터(메뉴/재료/직원/트럭) + 프로젝션. 단일 트랜잭션 커밋.
- 화면(디자인 ①②③④⑤): 장사 시작(세션 open), 주문 POS(카테고리칩·메뉴 그리드·장바구니·수량 스테퍼·총액 수동조정·할인메모·주문완료), 매출(큰숫자 매출·순이익 일토글 → 메뉴별 순위 → 주문내역[취소·지각 배지]), 메뉴 관리(카테고리 그룹·원가율 칩·품절 토글), 메뉴 추가/수정(판매가·원가·원가율 자동·카테고리·품절·레시피 재료 리스트).
- 추가 구현(디자인 누락분): 주문 취소 동작(매출 내역 주문 탭→상세→주문 취소, 보상 이벤트), 장사 종료 요약 시트(오늘 매출/순이익/주문수→세션 close).
- M4용 광고 슬롯 위치만 표시(SDK 없이 placeholder), entitlement seam 설계(전체 무료).
- 디자인 토큰 테마/공유 컴포넌트(카드·칩·토글·버튼·배지) 구축.
완료 기준: expo 앱 실행 → 메뉴 등록 → 장사 시작 → 주문 찍기 → 일매출/순이익 조회 → 주문 취소 반영 → 장사 종료 요약, 전부 로컬로 동작. 도메인 단위테스트 통과, 타입체크 통과.

@goal: M2 동기화 + PC 웹 조회
sync port 추상화 + vendor-neutral 이벤트 스키마(M1부터의 port 구현). 백엔드 이벤트 수신/배포, outbox push(event_id 멱등 upsert) + 단조 high-water-mark cursor pull, 다중기기 무손실 병합 골든. 시계스큐 날짜귀속(device_created_at+server_received_at, 영업세션 경계 anchor), 지각 동기화 표시. 역할별 pull 필터 골격(H3). PC 웹(React) 매출·분석 조회/편집(디자인 ⑨⑩⑪⑬). build vs buy 스파이크 time-box 후 확정(기본 BUY). 완료 기준: 2기기 오프라인 주문→재연결 무손실 합산 골든 통과, PC 웹 대시보드 조회 동작.

@goal: M3 직원·권한 + 분석 완성
초대코드/PIN 합류 화면(디자인 누락분 추가) + 로그인/사장 가입 화면(누락분 추가), 입력자 기록, 역할가드(라우트+API+pull 필터 H3 완성), 알바=주문 탭만(디자인 ⑦). 매출탭 완성(큰숫자→추이그래프→메뉴순위→주문내역, 일/월/연 토글). PC 웹 직원 관리(⑫). 완료 기준: 알바 합류→주문만 가능+매출/관리 차단(UI+데이터) e2e 통과.

@goal: M4 수익화
entitlement 게이팅 활성화(무료/유료 경계 UI 잠금 표시 일관 적용 — gold lock/blur 오버레이/업그레이드 CTA), 광고 SDK를 ad port 어댑터로 연동(장사 시작/종료 인터스티셜 1회씩, fail-open 비차단, POS·매출·알바 금지, 디자인 ⑧), 유료=ad-free, 구독 결제(PC 웹 요금제 ⑬). 완료 기준: 무료/유료 게이팅 e2e, 광고 세션 경계에만+오프라인 비차단 e2e 통과.
