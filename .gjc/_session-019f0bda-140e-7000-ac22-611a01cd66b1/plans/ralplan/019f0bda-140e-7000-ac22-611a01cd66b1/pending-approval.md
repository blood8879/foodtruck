# 푸드트럭 메뉴·매출 관리 앱 (MVP) — 최종 합의 계획 (pending approval)

> run_id: 019f0bda-140e-7000-ac22-611a01cd66b1 · deliberate · greenfield
> spec: deep-interview-foodtruck-menu-sales-mvp.md
> consensus: Planner → Architect(REQUEST CHANGES) → Critic(ITERATE) → rev.2 → Architect2(COMMENT) → rev.3 → Critic2(OKAY). 2 iteration, 차단 0건.
> 상세 구현계획 전문: stage-03-revision.md (이 문서는 의사결정 요약 + ADR + 의도정합성)

## 합의 상태
- **Critic2 = OKAY** (M1 착수 승인). HIGH(H1~H3)·MEDIUM(M-ORD/OBX/VOID/MTL/GATE)·LOW·신규(N1~N4) 전수 CLOSED.
- 전 품질기준 합격: Clarity/Verifiability/Completeness/BigPicture/PrincipleOptionConsistency/AlternativesDepth/RiskVerificationRigor.

## ADR (Architecture Decision Record)
### Decision
1. **이벤트소싱 + 박제**: 주문/취소/영업세션 open·close는 append-only 불변 이벤트, 주문라인에 판매가·원가 값복사(snapshot). 현재값(일/세션 집계·메뉴현황)은 fold 파생.
2. **로컬 우선 offline-first + 단조 동기화**: 로컬 SQLite 단일 트랜잭션 커밋(이벤트+프로젝션+outbox), event_id 멱등 union, 단조 high-water-mark 커서로 다운로드 무손실.
3. **동기화 엔진 기본 BUY**: PowerSync 등 로컬퍼스트 백엔드 권장. 커스텀은 H1/M-OBX/H3 골든 전수 통과 시 조건부. sync port 추상화로 결정 격리, M2 착수 즉시 time-box 스파이크로 확정.
4. **기술스택 B-1**: RN/Expo(모바일) + React(웹) + 공유 TS 도메인 코어 + Postgres/Node 백엔드.
5. **권한 데이터 경계**: 알바는 주문·취소만 + 서버 역할별 pull 필터(알바 기기에 매출 산출 이벤트 미전송).
6. **수익화 seam 선매립**: entitlement(plan tier)·광고 슬롯을 데이터모델·서비스 경계에 지금 심되 실제 광고 SDK·구독 결제는 M4. 광고는 영업 시작/종료 시점에만, POS·매출·알바 흐름엔 절대 없음.

### Drivers
- 오프라인 다중기기 무손실·정합 다운로드(최상위 AC).
- 박제+보상이벤트+세션경계로 분석·권한 정합성.
- MVP 출시속도 + 수익화 확장성(단일 TS 스택, seam 선매립).

### Alternatives Considered
- 동기화: A-2 커스텀 최소형(조건부), A-3 문서DB 복제(분석 약점). → BUY 채택, 다운로드 정합성은 무충돌 병합과 별개의 어려운 문제라 검증된 엔진이 안전.
- 스택: B-2 Flutter+Supabase(코어 공유 불가·분석 약점 탈락), B-3 PWA(오프라인 신뢰성 약점 탈락).

### Why Chosen
- append-only 도메인이지만 '다운로드 commit-order 비단조 유실'은 실존 리스크 → BUY로 de-risk + port로 전환 자유 확보.
- TS 단일 코어가 박제·fold·집계·entitlement 정합성을 1곳에서 검증 가능.

### Consequences
- (+) 핵심 리스크(병합·정합성) 외주화, 분석/권한 결정론, 수익화 무침습.
- (−) 벤더 종속·비용(미확인 #2), 네이티브 빌드 관리 부담.

### Follow-ups
- M2 착수 즉시 build/buy 스파이크 판정(사전기준: H1 누락0/M-OBX 크래시정합/H3 역할필터 골든 + 운영비용).
- v2 백로그: 재고·레시피 자동차감, 실시간 위치, 외부(손님) 결제·결제수단별 매출, 세무용 매출.

## 범위 / 마일스톤
- **M1 (로컬 단독)**: 메뉴 CRUD(원가율·카테고리·품절·선택레시피), POS(그리드+장바구니+수동총액+할인메모), 영업세션 open/close(영업일 경계 anchor), 주문/취소 단일 이벤트 봉투 로컬 append+박제, 로컬 fold 일/세션 매출. entitlement seam 설계(전체 무료), 광고 슬롯 위치만.
- **M2 (동기화 + PC웹 조회)**: sync port + 단조 커서(H1) + 단일트랜잭션 outbox(M-OBX) + 역할별 필터 골격(H3), 다중기기 무손실 병합, 시계스큐 날짜귀속(H2), 지각분 표시. PC 웹 매출·분석 조회/편집. build/buy 확정 게이트.
- **M3 (직원·권한 + 분석 완성)**: 초대코드/PIN 합류, 입력자 기록, 역할가드(라우트+API+pull 필터 완성), 알바 주문탭만. 매출탭 완성(큰숫자→그래프→메뉴순위→내역, 일/월/연 토글).
- **M4 (수익화, MVP 외)**: entitlement 게이팅 활성, 광고 SDK(ad port, 시작/종료 인터스티셜, fail-open 비차단), 유료=ad-free, 구독 결제.

## 핵심 데이터 모델 (요약)
- Truck(plan_tier, active_session_id 파생) / Staff(role owner|staff, pin) / Menu(가변 마스터: 판매가·원가·원가율·카테고리·품절·선택레시피) / RecipeItem.
- BusinessSession(open/close 이벤트, 영업일 경계, 활성세션 1개 불변식, orphan 보류+멱등).
- Order(단일 불변 봉투: payload.lines[], device/server 이중 타임스탬프, session_id, manual_total) / OrderLine(프로젝션, 박제) / OrderVoid(보상, orphan 보류+멱등).
- PlanTier/Entitlement(free|paid 기능 플래그) / AdPort(비차단 계약) / DailySummary·SessionSummary(fold 파생).
- fold 규칙: gross=manual_total 우선·없으면 라인합, cost=라인 unit_cost합, net=gross−cost, void 전액 제외, 메뉴순위=매출액(박제 menu).

## 검증 (골든 전수)
- unit: 원가율·레시피합산·fold(매출/원가/순이익)·void 제외·박제우선·M-MTL·entitlement 판정·orphan/중복 void·세션 close 멱등.
- integration: push 멱등·단조커서 concurrent-commit 누락0(H1)·이중쓰기 제거 크래시정합(M-OBX)·시계스큐 날짜귀속(H2)·2기기 동시 open→활성1개(N2)·지각 날짜귀속.
- e2e: 알바 pull 유출0+세션태깅(H3/N3)·알바 주문탭만+매출403·사장4탭·오프라인2기기 무손실·비원자주문 방지(M-ORD)·매출탭 레이아웃·품절비활성·세션 open/close 집계·광고 슬롯 세션경계에만+오프라인 비차단(N4)·entitlement 게이팅.
- observability/불변성가드: outbox 깊이·커서·시계오프셋·역할필터 카운터·광고노출 로그 / 이벤트 update·delete 금지·집계 rebuild 일치·박제 회귀.

## Intent Reconciliation (승인 전 사용자 확인 — 자동모드 미확인 항목)
1. **수익화 분리**: MVP는 entitlement seam·영업세션·광고 슬롯 위치만, 실제 광고 SDK·구독 결제는 M4. 이 분리가 의도와 맞는가?
2. **동기화 BUY 기본**: PowerSync 등 벤더 종속·비용 발생 수용 가능한가, 아니면 무종속 커스텀 선호?
3. **기술스택 B-1**(RN/Expo+React+TS+Postgres/Node): 미선택 가정 — 수용 가능한가?
4. **무료/유료 경계**(사업 결정): 무료=트럭1·메뉴N·당일매출 / 유료=다중직원·기간분석·그래프·PC웹·내보내기. 가정 — 확인 필요.
5. **[HIGH 충돌] 다중 직원 게이팅 ↔ 핵심 시나리오**: deep-interview는 '사장·알바 다중기기 동시 입력'을 핵심으로 확정했는데, 다중직원을 유료로 막으면 무료 MVP가 핵심 시나리오를 못 쓴다. 옵션 (a)다중직원 무료 포함+다른 것 유료, (b)무료 직원 N명까지 후 초과 유료. 실행 전 결정 권장.
6. **[정보]** M4 구독 결제는 앱 구독료로, 명세 Non-Goal '외부(손님) 결제'와 별개(충돌 아님).

## 상태
**pending approval** — 실행 승인 전까지 제품 코드 변경·실행 위임 없음. 승인 시 기본 ultragoal로 실행(team은 tmux 병렬이 꼭 필요할 때만).
