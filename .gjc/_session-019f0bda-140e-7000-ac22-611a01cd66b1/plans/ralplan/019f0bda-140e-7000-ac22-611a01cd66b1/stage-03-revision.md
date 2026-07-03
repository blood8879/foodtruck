# 푸드트럭 메뉴·매출 관리 앱 (MVP) — 구현 계획 rev.3 (deliberate, 최종 보강)

> spec: deep-interview-foodtruck-menu-sales-mvp.md · greenfield · stage-03 revision
> rev.3 변경: Architect2 WATCH/COMMENT로 rev.2 HIGH/MEDIUM/LOW 전수 CLOSED 확인. 신규 잔존 4건(N1~N4)만 추가 반영. rev.2 모든 내용 유지.

---

## 변경 요약 (rev.2 → rev.3)
- **N1 (MEDIUM)**: BusinessSession **close 이벤트도 orphan 보류큐 + event_id 멱등**(void와 동일 라이프사이클) + 골든.
- **N2 (MEDIUM)**: **트럭당 활성 세션 1개 불변식** — 멀티기기 동시 open 시 중복 open 거부/병합(소유권 규칙) + integration 골든. 영업일 anchor·SessionSummary 분기 방지.
- **N3 (MEDIUM)**: H3 역할별 pull 화이트리스트에 **'세션 open 메타(매출 산출 필드 0)'** 명시 포함 → 알바도 session_id 태깅 가능 + e2e.
- **N4 (LOW)**: **ad port 계약에 timeout/offline-skip/세션전환 비차단** 명문화(광고가 장사 시작/종료를 절대 막지 않음), M4.
- rev.2의 H1~H3·M-ORD/OBX/VOID/MTL/GATE·LOW·pre-mortem·골든·마일스톤·수익화 seam 전부 유지.

---

## RALPLAN-DR 요약

### Principles
1. **이벤트소싱 우선**: 주문/취소/세션 open·close는 append-only 불변 이벤트, 현재값(일집계·세션집계·메뉴현황)은 fold 파생.
2. **로컬 우선 offline-first**: 모든 쓰기는 로컬 단일 트랜잭션 커밋 후 즉시 동작. 동기화는 백그라운드 멱등 작업, UX 차단 금지.
3. **박제 불변성**: OrderLine은 생성시점 판매가·원가를 값복사 보관, 마스터 변경 과거 미소급.
4. **멱등·단조 동기화**: event_id union 멱등 + 단조 high-water-mark 커서로 무손실. 충돌은 병합 대상. **모든 이벤트(주문/void/세션 open·close)는 orphan 보류 + event_id 멱등 라이프사이클 공유**.
5. **권한 최소노출(데이터 경계까지)**: 알바는 주문·취소만 + 서버 pull이 역할별 화이트리스트로 데이터 필터. 알바 기기엔 매출 산출 가능 이벤트(타기기 주문/원가 박제) 미전송, **단 세션 open 메타(매출필드 0)는 태깅용으로 허용**.
6. **수익화 seam 선매립**: entitlement(plan tier)·광고 슬롯을 데이터모델·서비스 경계에 선매립, 실제 SDK/결제는 M4. MVP 전체 무료 개방. **광고는 어떤 경우에도 영업 흐름을 차단하지 않음**.

### Decision Drivers (top 3)
1. **오프라인 다중기기 무손실·정합 다운로드** — concurrent commit 유실0(H1) + 세션 불변식(N2). 동기화 build/buy 지배.
2. **분석·권한 정합성** — 박제+보상이벤트+세션경계 날짜귀속(H2)+역할별 데이터 필터·세션 태깅(H3/N3)로 매출/순이익/권한 항상 일관.
3. **MVP 속도 + 수익화 확장성** — 소규모 운영, 단일 TS 스택, 수익화 seam 선매립(비차단 광고 포함)으로 후속 비용 최소.

### Viable Options

#### (a) 동기화 엔진: Build vs Buy — **기본 기울기 BUY**
- **Opt A-1 — Buy: 로컬퍼스트 동기화 백엔드 (권장)**: PowerSync(+Postgres)/ElectricSQL/Couchbase Lite. pros: 논리복제/단조 커서·오프라인 큐·재전송·델타동기화 검증 제공 → H1 외주화, 역할별 sync rules(H3/N3) 선언 지원. cons: 벤더 종속·비용·이벤트소싱을 위에 얹음.
- **Opt A-2 — Build: 커스텀 이벤트 로그 + 단조 커서**: (i)논리복제 슬롯 (ii)commit_ts+overlap window (iii)high-water-mark=min(미commit seq). push는 event_id 멱등 upsert. pros: 도메인 100% 맞춤·무종속. cons: 단조성·부분실패·시계스큐 직접 골든화.
- **권장: A-1(BUY) 기본, A-2는 H1/M-OBX/H3 + N1/N2 세션 골든 전수 통과 시 조건부.** 근거: 무충돌은 '병합'에만 성립하고 다운로드 정합성(commit-order 비단조 누락)은 별개의 분산로그 난제. 검증된 BUY가 리스크 낮춤. sync port로 결정 격리.

#### (b) 기술 스택 — **B-1 권장**
- **B-1 RN/Expo + React + 공유 TS 코어 + Postgres/Node**: 모바일+웹 단일 TS, 도메인 코어(fold·원가율·집계·세션·entitlement) 공유, 네이티브 SQLite 오프라인 신뢰성, React 분석 UX, PowerSync RN/web SDK 정합.
- **B-2 Flutter+Supabase** 탈락(백엔드/동기화 생태계 좁음·코어 공유 불가·웹 분석 약점). **B-3 PWA** 탈락(오프라인 신뢰성 약점→'오프라인 필수' 위배).

### Pre-mortem (8 시나리오)
1. **다운로드 유실(H1)** — last_seq 단순 커서가 commit-order 비단조에서 동시 commit 건너뜀. 신호: 기기합산≠개별합·영구 누락. 완화: 단조 high-water-mark / commit_ts+overlap / 논리복제 슬롯. 골든 'concurrent commit 누락0'. 불가 시 BUY.
2. **시계스큐 날짜귀속(H2)** — device created_at만으로 엉뚱한 영업일. 완화: 이중 타임스탬프 + 오프셋·임계 플래그 + BusinessSession 경계 anchor + 타임존 명문화. 골든 '+6h 스큐도 같은 세션'.
3. **권한 데이터 유출(H3/N3)** — 전체 이벤트 복제로 알바가 매출 산출. 완화: 서버 역할별 pull 화이트리스트(알바=메뉴 마스터+자기주문+세션 open 메타[매출필드0]). 골든/e2e '알바 pull 매출필드0, session_id 태깅 가능'.
4. **비원자 주문(M-ORD)** — 헤더/라인 분리 전송 부분도착. 완화: 단일 불변 이벤트 봉투(payload lines[]), 라인=프로젝션. 골든 '라인배열 원자 적용'.
5. **이중쓰기(M-OBX)** — event/outbox 분리 write 크래시 불일치. 완화: event(seq=null)에서 outbox 파생, 단일 SQLite 트랜잭션. 골든 '커밋직후 크래시→정합'.
6. **orphan/중복 이벤트(M-VOID + N1)** — void/세션 close가 target보다 먼저 도착 또는 중복. 완화: **void·세션 close 공통 orphan 보류큐→target 도착 시 적용, event_id 멱등(1회만)**. 골든 'orphan void/close→적용·중복→1회'.
7. **세션 분기(N2)** — 멀티기기 동시 open으로 활성 세션 2개 → 영업일 anchor·SessionSummary 분기. 신호: 한 트럭 동시 활성 세션>1, 매출 이중 집계 경계. 완화: **트럭당 활성 세션 1개 불변식** — 중복 open 거부 또는 소유권 규칙(가장 이른 open_event_id/UUIDv7 우선)으로 병합, 후속 open은 no-op·기존 session_id로 흡수. integration 골든 '2기기 동시 open→활성 1개'.
8. **광고 차단(N4)** — 광고 SDK 로딩/네트워크 지연이 장사 시작/종료를 막음. 신호: 오프라인 시 세션 전환 hang. 완화: **ad port 계약에 timeout·offline-skip·세션전환 비차단** — 광고 실패/지연 시 즉시 세션 전환 진행. e2e '오프라인/타임아웃에도 세션 전환 비차단'.

### 확장 테스트 골든 (HIGH/MEDIUM/LOW + N1~N4 전수)
- **Unit (도메인 코어)**: 원가율, 레시피 원가합산, fold(매출/원가/순이익), 보상이벤트 제외, 박제값 우선, M-MTL fold 규칙, 메뉴순위(매출 기준·박제 menu), orphan/중복 void(M-VOID), **세션 close orphan/멱등(N1)**, **활성 세션 1개 불변식 판정(N2)**, entitlement 게이팅 판정.
- **Integration (로컬DB+동기화)**: push 멱등, 단조 커서 concurrent-commit 누락0(H1), 이중쓰기 제거 크래시 정합(M-OBX), 시계스큐 날짜귀속(H2), **2기기 동시 session open→활성 1개 수렴(N2)**, per-event lateness(LOW), truck_id 스코프 강제(LOW), 지각 동기화 날짜귀속.
- **e2e**: 알바 pull 매출유출0 + **session_id 태깅 가능(N3)**, 알바 주문탭만·매출 API 403, 사장 4탭, 오프라인 2기기 무손실 합산, 비원자주문 방지(M-ORD), 매출탭 레이아웃, 품절토글 비활성, 영업세션 open/close→세션집계·날짜경계, 광고 슬롯 세션 open/close에만·POS/매출/알바 0, **광고 오프라인/타임아웃 세션전환 비차단(N4)**, entitlement 무료/유료 게이팅.
- **Observability**: outbox 깊이/재시도/실패, 커서 high-water-mark·last server_received, 중복제거 건수, 시계 오프셋·임계 플래그, 역할별 pull 필터 적용 카운터, **활성 세션 수 게이지(N2)**, **광고 skip/timeout 카운터(N4)**, 재집계 트리거, 동기화 상태 배지, 광고 노출/entitlement 결정 로그.
- **불변성 가드(상시)**: 이벤트 update/delete 금지, 집계 rebuild 일치, 박제 불변 회귀.

---

## 계획 본문

### 구성요소 & 구현 순서
1. **메뉴 관리** → 2. **주문 등록(POS)** → 3. **매출·수익 분석**. **영업세션(open/close 라이프사이클·활성1개 불변식)** 은 POS와 함께 M1(날짜경계 anchor). **직원·권한**과 **entitlement seam**은 전 단계 교차삽입(M1 설계, M3 권한 완성, M4 수익화 활성).

### 데이터 모델 / 이벤트 스키마 개요
- **Truck**: id, 트럭명, owner_account_id, invite_code, plan_tier(free|paid 기본 free), **active_session_id(파생, 활성 세션 1개 불변식)**.
- **Staff**: id, truck_id, 이름, role(owner|staff), pin_hash, joined_at.
- **Menu** (가변 마스터): id, truck_id, 이름, sell_price, cost, category, sold_out, updated_at. **RecipeItem**: menu_id, 이름, unit_price, unit, qty → cost 파생(선택).
- **BusinessSession (이벤트, open/close 공통 라이프사이클)**: open 이벤트(event_id UUIDv7, truck_id, device_id, opened_by, device_created_at, server_received_at), close 이벤트(event_id, target_session_id, closed_by, device_created_at, server_received_at). **open~close = 명시적 영업일 경계 anchor. close도 orphan 보류큐+event_id 멱등(N1). 트럭당 활성 1개 불변식: 동시 open은 소유권 규칙(이른 UUIDv7 우선)으로 병합·후속 no-op(N2).**
- **Order (단일 불변 이벤트 봉투, M-ORD)**: event_id(UUIDv7), truck_id, session_id, device_id, device_created_at, server_received_at, entered_by, discount_memo, manual_total(nullable), payload.lines[]. status 파생.
  - **OrderLine (프로젝션, 박제)**: menu_id, menu_name, qty, unit_price, unit_cost (값복사 불변).
- **OrderVoid (보상 이벤트)**: event_id, target_order_event_id, voided_by, ts (orphan 보류·멱등).
- **PlanTier/Entitlement**: tier(free|paid), 기능 플래그(다중직원·기간분석·그래프·PC웹·내보내기·ad_free). MVP 전체 개방(seam), M4 활성.
- **DailySummary / SessionSummary (derived, fold)**: 날짜·세션별 gross/cost/net, late_synced 플래그, 메뉴순위(박제 menu·매출 기준). 활성 세션 1개 불변식으로 분기 방지. 항상 이벤트 재생성.
- 공통 동기화 봉투: event_id, truck_id, session_id, device_id, server seq, device_created_at, server_received_at. outbox는 event(seq=null) 파생, 단일 트랜잭션. **주문·void·세션 open/close 모두 동일 orphan 보류+멱등 경로.**

### 동기화 / 오프라인 전략
- **로컬 우선 단일 트랜잭션**: 이벤트+프로젝션+outbox를 한 SQLite 트랜잭션으로 커밋(M-OBX).
- **Push**: outbox 미ACK 이벤트를 event_id 멱등 upsert, 지수백오프, ACK 시 제거.
- **Pull(단조, H1)**: high-water-mark=min(미commit seq) 미만만 확정(또는 commit_ts+overlap / 논리복제 슬롯). concurrent commit 누락0.
- **Orphan 보류 라이프사이클(공통, N1)**: 주문 void·세션 close가 target보다 먼저 도착하면 보류큐→target 도착 시 적용, event_id 멱등.
- **세션 불변식(N2)**: 서버가 truck당 활성 세션 1개 강제. 멀티기기 동시 open → 소유권 규칙(이른 UUIDv7)으로 병합, 후속 open no-op·동일 session_id 반환.
- **역할별 필터(H3/N3)**: 서버 pull 화이트리스트 — 알바=메뉴 마스터 + 자기 작성 주문 + **세션 open 메타(매출 산출 필드 0)**. 타기기 주문·원가 박제·집계 미전송. 알바도 session_id 태깅 가능.
- **날짜귀속(H2)**: device_created_at + server_received_at 이중 보관, 오프셋 추정·임계 플래그, BusinessSession 경계로 영업일 확정, 타임존(심야영업) 명문화. 지각분 자동합산+표시(per-event lateness, LOW).
- **박제**: 이벤트만 전파, 집계는 각 노드 fold 재생성. **truck_id 스코프 강제(LOW)**.

### M-GATE (build vs buy 게이트)
- **sync port 추상화 + vendor-neutral 이벤트 스키마 M1부터 적용**. 사전 판정기준: H1(누락0)/M-OBX(크래시 정합)/H3(역할 필터)/N1·N2(세션 라이프사이클·불변식) 골든 + 운영비용/SDK 정합. **M2 착수 즉시 time-box 스파이크(PowerSync 등), 기본 BUY**, 커스텀은 골든 전수 통과 시.

### fold 규칙 (M-MTL)
- gross = manual_total 있으면 manual_total, 없으면 Σ(line unit_price×qty). cost = Σ(line unit_cost×qty). net = gross − cost. void 주문은 전부 제외. 메뉴순위 = 박제 menu·매출액 기준(수량 보조).

### 마일스톤
- **M1 — 로컬 단독 (메뉴 + POS + 영업세션 + 일/세션 매출)**: 메뉴 CRUD(원가율·카테고리·품절·선택레시피), POS(그리드+장바구니+수동총액+할인메모, 품절 비활성), **BusinessSession open/close 라이프사이클(orphan 보류·멱등·활성1개 불변식 N1/N2) 영업일 anchor**, 주문/취소 단일이벤트 봉투 로컬 append, 박제, 로컬 fold 일/세션 매출. 단일 사장. entitlement seam 설계(전체 무료 개방), **광고 슬롯 위치 + ad port 인터페이스(비차단 계약 N4) 정의만, SDK 없음**.
- **M2 — 동기화 + PC 웹 조회**: sync port + 단조 커서(H1) + 단일트랜잭션 outbox(M-OBX) + 역할별 필터 골격(H3/N3) + **세션 불변식·orphan 라이프사이클 서버 강제(N1/N2)**, 다중기기 무손실 병합, 시계스큐 날짜귀속(H2), 지각분 표시. PC 웹 매출·분석 조회/편집. M-GATE 스파이크·확정.
- **M3 — 직원·권한 + 분석 완성**: 초대코드/PIN 합류, 입력자 기록, 역할가드(라우트+API+**pull 필터 H3/N3 완성: 알바 session_id 태깅·매출유출0**), 알바 주문탭만. 매출탭 완성(큰숫자→그래프→메뉴순위→내역, 일/월/연 토글, 취소·지각 표시).
- **M4 — 수익화(MVP 외)**: entitlement 게이팅 활성화(무료: 트럭1·메뉴N·당일매출 / 유료: 다중직원·기간분석·그래프·PC웹·내보내기), 광고 SDK를 **ad port 어댑터(timeout·offline-skip·세션전환 비차단 계약 N4)** 로 연동(장사 시작/종료 인터스티셜 1회씩 하루2회, POS/매출/알바 절대 금지), 유료=ad-free, 구독 결제.

### Acceptance Criteria 매핑
| AC | 마일스톤 | 검증 |
|---|---|---|
| 판매가·원가→원가율 자동 | M1 | unit |
| 카테고리+품절토글 POS 중지 | M1 | e2e |
| (선택)레시피→원가 자동 | M1 | unit |
| 초대코드/PIN 알바 합류 | M3 | e2e |
| 알바 주문·취소만, 매출/관리 차단 | M3 | e2e UI+API403 |
| 오프라인 메뉴탭+수량 주문 | M1 | e2e |
| 2기기 오프라인 무손실 합산 | M2 | integration 병합+단조커서(H1) |
| 박제+가격변경 미소급 | M1/M2 | regression |
| 취소 이력보존+매출제외 | M1/M3 | unit fold + orphan/중복 void(M-VOID) |
| 총액 수동조정+할인메모 | M1 | unit M-MTL |
| PC·폰 일/월/연 매출·순이익 | M2/M3 | e2e |
| 지각분 날짜 자동반영+표시 | M2 | integration H2 시계스큐 |
| 사장4탭/알바 주문탭만 | M3 | e2e |
| 매출탭 큰숫자→그래프→순위→내역 | M3 | e2e |
| 영업세션 open/close→세션집계·날짜경계 | M1 | e2e/integration |
| (신규)세션 close orphan/멱등 라이프사이클 | M1/M2 | unit/integration(N1) |
| (신규)트럭당 활성 세션 1개 불변식 | M2 | integration 2기기 동시 open(N2) |
| (신규)알바 session_id 태깅 가능·매출유출0 | M3 | e2e(H3/N3) |
| 광고 슬롯 세션 open/close에만, POS/매출/알바 0 | M4(슬롯·port M1) | e2e |
| (신규)광고 오프라인/타임아웃 세션전환 비차단 | M4(계약 M1) | e2e(N4) |
| entitlement 무료/유료 게이팅 | M4(seam M1) | unit/e2e |
| 비원자 주문 방지(라인 원자) | M1/M2 | integration M-ORD |
| 알바 pull 데이터 유출0 | M3 | e2e H3 |

### Ontology 추가/갱신
- **BusinessSession** (core, 이벤트): open/close **공통 라이프사이클(orphan 보류·event_id 멱등 N1)**, 영업일 경계 anchor, **트럭당 활성 1개 불변식(N2)**, has many 주문(session_id).
- **PlanTier/Entitlement** (core): tier(free|paid) + 기능 플래그, belongs to 트럭.
- **AdSlot/AdPort** (boundary, M4): 세션 open/close 슬롯, **비차단 계약(timeout·offline-skip N4)**.

### 위험 / 완화
- 다운로드 정합성(최상위): 단조 커서 골든, 미통과 시 BUY(H1).
- 날짜 흔들림: 세션 경계 anchor + 이중 타임스탬프(H2).
- 권한 유출: 서버 역할별 pull 화이트리스트(세션 메타만 예외, 매출필드0)(H3/N3).
- 비원자/이중쓰기: 단일 이벤트 봉투 + 단일 트랜잭션(M-ORD/M-OBX).
- 세션 분기/유령 close: 활성1개 불변식 + orphan 보류·멱등(N1/N2).
- 수익화 침습/광고 차단: seam만 선매립, 광고는 세션 경계 격리 + 비차단 계약(N4), 결제 M4 분리.
- build vs buy 미결: sync port로 결정 격리 + time-box 스파이크(M-GATE).

### 후속 작업 (handoff)
- **architect**: M-GATE 스파이크 후 build vs buy 확정, 단조 커서·역할별 pull 화이트리스트·세션 불변식/orphan 라이프사이클·이벤트 봉투 스키마 리뷰(M2 차단형).
- **critic**: HIGH/MEDIUM/N1~N4 골든이 추측 없이 실행가능한지, 수익화 seam·비차단 광고가 MVP 침습 없는지 검증.
- **executor**: M1 슬라이스 위임(코어→로컬DB/단일트랜잭션→POS+세션 라이프사이클→메뉴UI→entitlement seam+ad port 인터페이스). 통합·검증 부모.
- **ultragoal/team**: M1~M4 장기실행 시 원장 채택.
- v2/향후 백로그: 재고·레시피 자동차감, 실시간 위치, 외부결제·결제수단별 매출, 세무용 매출.
