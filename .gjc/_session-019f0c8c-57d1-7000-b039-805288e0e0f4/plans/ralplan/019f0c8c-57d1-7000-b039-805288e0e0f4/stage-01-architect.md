# Architect Review — 푸드트럭 메뉴·매출 MVP 구현계획 (deliberate, stage_n=1)

## Summary
계획의 골격(이벤트소싱·로컬우선·박제·멱등·권한최소노출 원칙, 메뉴→POS→분석 의존순서, M1~M3 계층화)은 도메인에 잘 들어맞아 아키텍처적으로 건전하다. 다만 프로젝트의 1순위 AC(오프라인 다중기기 무손실 병합)를 실제로 보증하지 못하는 다운로드(cursor pull) 정합성 공백, 기기시계 권위에 의한 날짜귀속 오류, 알바 기기로의 전체 이벤트 복제(권한최소노출 위반)라는 세 개의 HIGH가 미해결이다. 상태 WATCH / 권고 REQUEST CHANGES — 결정을 뒤집기보다 M1 착수 전에 스키마·동기화 계약을 보강하라.

## Stage 1 — 명세 적합성
- 활성 4개 토픽(메뉴/POS/매출분석/직원권한)과 14개 AC가 마일스톤에 빠짐없이 매핑됨. 누락·과잉 기능 없음.
- 박제(R7), 보상이벤트 취소(R10), 순이익=매출−재료원가(R5), 지각동기화 자동반영+표시(R11), 4탭/알바 주문탭(R15), 매출 레이아웃(R16) 모두 반영.
- 적합성 자체는 통과. 문제는 적합성이 아니라 핵심 AC를 보증하는 메커니즘의 정밀도 부족.

## Stage 2 — 아키텍처
- 강점: fold read-model은 집합(set)에 대한 가환·멱등 연산이므로, 모든 이벤트를 보유하기만 하면 도착순서·재전송과 무관하게 결정적 결과 산출 → 무손실 주장의 진짜 근거. 따라서 유일한 파탄 경로는 이벤트를 누락하는 것(cursor 갭)이며 거기에 리스크가 집중됨.
- 약점: 업로드(outbox+ACK+멱등upsert)는 견고하나, 다운로드(last_seq cursor)는 서버 seq의 commit 순서 비단조성 문제를 다루지 않음. build vs buy 게이트가 느슨하여 M1 저장층이 sync 가정에 결합되면 전환비용이 급증.

## Stage 3 — 정합성/보안/성능 (findings 참조)

## Root Cause (무손실 병합 리스크의 본질)
append-only 도메인에서 충돌해결(CRDT/LWW)이 불필요하다는 판단은 옳다. 그러나 일반 sync 라이브러리의 무게 대부분은 mutable-row 충돌이 아니라 (1)크래시 내성 outbox (2)cursor 다운로드의 commit-order 가시성 (3)테넌트/권한 스코프에 있다. 계획은 (1)을 다루나 (2)(3)을 다루지 않는다. 즉 커스텀-최소형이 제거했다고 본 복잡도(충돌해결)는 실제로 우리 리스크가 아니었고, 남은 진짜 리스크(다운로드 정합성)는 그대로 남아 있다.

## Findings

### HIGH
- H1 (다운로드 정합성 / 무손실 병합 AC 직격): pull을 last_seq 커서로 한다고만 명시. 서버 seq를 insert 시점 시퀀스/auto-increment로 부여하면 트랜잭션 commit 순서가 역전될 수 있다(seq=5 트랜잭션이 seq=7보다 늦게 commit). 클라가 이미 last_seq=7로 전진하면 seq=5는 영영 재수신되지 않아 이벤트가 조용히 유실 → 두 기기 합산 매출 ≠ 개별 합. 1순위 AC 미충족.
  - Fix: commit-order 단조성 확보 — 논리복제 슬롯, 또는 commit 시각 + 재방문 overlap window, 또는 high-water-mark = min(미commit 트랜잭션) 기준 커서. M2 첫 슬라이스에서 'concurrent commit 시 누락 0' 골든테스트로 고정. 이 설계를 확정·테스트할 수 없으면 buy로 전환.
- H2 (날짜귀속 / 시계 스큐): DailySummary 날짜를 created_at(기기 로컬시계)에 전적으로 귀속. 기기 시계가 어긋나면(흔함) 주문이 엉뚱한 영업일에 합산되고 서버 교정 경로가 없다. AC '지각 동기화분 해당 날짜 자동 반영'을 시계 스큐 하에서 보증 못함. 무손실(이벤트 보존)과 정확집계(올바른 날짜)는 별개임에 주의.
  - Fix: 이벤트에 device created_at + server received_at 동시 보관, 클라-서버 오프셋 추정/표시 또는 임계 초과 시 플래그. 영업일 경계·타임존(특히 자정 넘겨 영업하는 심야 케이스) 명문화.
- H3 (권한최소노출 위반 — deliberate 플래그): 동기화는 truck 단위 전체 이벤트 로그를 전파. 알바 기기에 박제 unit_cost/매출 산출에 필요한 모든 이벤트가 복제되면, UI/REST를 차단해도 클라이언트에서 매출·순이익을 직접 계산 가능. 동기화 자체가 데이터를 유출하는 API다. 원칙5(클라 숨김만으로 끝내지 않음)에 정면 위배.
  - Fix: 서버측 pull scope를 역할별로 필터(알바 기기는 메뉴 마스터 + 주문 작성에 필요한 데이터로 한정, 타 기기 주문/원가 박제 미전송). 알바가 자기 주문 입력에 타기기 이벤트 수신이 불필요함을 활용.

### MEDIUM
- M-ORD (원자성): OrderLine을 별도 테이블/종속으로만 기술. 라인이 주문과 분리되어 동기화되면 부분실패로 라인 없는 주문이 생겨 합계 오염. Fix: 주문+라인을 단일 불변 이벤트 봉투(payload 내 라인 배열)로 원자 전송, 라인 테이블은 정규화 프로젝션으로만.
- M-OBX (이중쓰기): event 테이블과 별도 outbox를 두면 event commit과 outbox 마커가 비원자적일 때 로컬 이벤트가 영영 미동기화(타기기 무손실 위반). Fix: 미동기 이벤트(seq null)를 그대로 outbox로 파생, dual-write 제거(단일 SQLite 트랜잭션).
- M-VOID (비순서/중복 취소): void가 target 주문보다 먼저 도착(orphan void)하거나 동일 target에 void 2회 시 처리 미정 → 이중 차감/일시 누락. Fix: fold가 orphan void를 보류했다 target 도착 시 적용, void는 멱등(이미 취소면 무효과).
- M-MTL (manual_total 의미론): 수동총액/할인이 gross·net·메뉴순위와 어떻게 상호작용하는지 미정의. gross가 할인 후 총액인지, manual_total 시 라인별 매출 귀속·순위 지표(수량 vs 매출)가 무엇인지 불명. Fix: fold 규칙 명문화(예: gross=manual_total 우선·없으면 라인합, cost=라인 unit_cost 합, 순위=수량 또는 라인 매출 기준 택1).
- M-GATE (build/buy 게이트 느슨): 'M2에서 판정'이 결정을 가장 비싼 시점으로 미룸. Fix: M1에서 sync를 port(헥사고날)로 추상화해 이벤트 로그를 vendor-neutral 유지, buy 스파이크를 M2 착수 즉시 time-box, 판정기준(누락0 골든 통과·구현/운영비용 임계·SDK 모바일+웹 적합)을 지금 문서화.

### LOW
- L-LATE: late_synced가 day 단위 coarse 플래그 → per-event lateness 권장.
- L-TEN: 멀티트럭 확장 대비 truck_id 스코프를 fold/쿼리에서 강제 명시.
- L-RANK: 메뉴순위 그룹핑에 가변 category가 끼면 과거 그룹핑이 흔들림 — 순위는 박제 menu 기준 유지 명시.

## Steelman (계획의 가장 강한 반대 관점)
'커스텀 최소형 우선 + M2 게이트'가 아니라 'M1부터 buy(PowerSync/Electric 등)로 확정'해야 한다. 근거: 이 프로젝트의 실존적 1순위 리스크는 오프라인 다중기기 무손실 병합이고, H1(commit-order)·M-OBX(크래시 내성 outbox)·H3(테넌트/권한 스코프)는 성숙한 로컬-퍼스트 엔진이 수년간 단단히 만든 바로 그 영역이다. 커스텀-최소형은 우리 최상위 리스크를 사내로 끌어들여 의존성 하나를 아끼고, 정작 '살까?' 결정을 M1 저장층 매몰비용이 쌓인 뒤(전환 최고가 시점)로 미룬다. 'append-only라 단순하다'는 다운로드 정합성을 과소평가한다(충돌해결과 무관한 별개 난제). 규율 있는 팀이라면 M1부터 buy를 채택해 이벤트를 row로 모델링하고, 기성 답이 없는 도메인 정합성(박제·fold·권한)에 희소 노력을 집중한다.

## Synthesis
build/buy는 마일스톤을 가로지르는 이분법이 아니다. 핵심은 'M1 저장층이 sync 엔진에 결합되지 않게' 하는 것: 이벤트 로그를 sync port 뒤에 두면, 같은 vendor-neutral 이벤트 스키마 위에서 커스텀이든 PowerSync(Postgres row 복제)든 어댑터만 교체된다. 그러면 (a)M1은 로컬 단독으로 안전 진행, (b)build/buy는 M2 착수 즉시 사전기준으로 판정, (c)어느 쪽이든 H1/M-OBX/H3를 골든으로 검증. steelman의 '리스크 위치' 지적은 옳고, 계획의 '도메인 결합 낮음' 직관도 옳다 — 둘을 port 추상화 + 조기 time-box 스파이크 + 사전 판정기준으로 동시에 만족시킨다.

## Sync build vs buy — 최종 판정
- 판정: 커스텀-최소형 우선은 조건부 수용. 단, (1)H1 commit-order 설계 확정 + 'concurrent commit 누락0' 골든, (2)M-OBX 단일 트랜잭션 outbox 파생, (3)H3 역할별 pull scope — 이 셋을 충족할 때만. 충족 불가/불확실하면 BUY(PowerSync 권장: Postgres+TS+모바일/웹 적합)로 전환.
- 기본 기울기: 팀 규모(사장1+소수 알바)와 명세의 명시 드라이버(출시속도·유지보수 단순성)를 고려하면 BUY가 MVP de-risk에 더 안전하다. 커스텀은 'append-only가 충돌해결을 진짜로 제거한다'는 점에서만 정당하며, 다운로드 정합성/내구성 outbox/권한 스코프는 제거하지 못한다.
- 게이트 방식: '느슨한 M2 판정'은 부적절. '지금 port 추상화 + M2 착수 즉시 time-box 스파이크 + 사전 명문화된 판정기준'으로 강화하라. 처음부터 build/buy를 완전 확정할 필요는 없으나, 결정을 형성하는 저장층 설계(이벤트 스키마 vendor-neutral, sync port)는 지금 확정해야 한다.

## Architectural Status
WATCH

## Code Review Recommendation
REQUEST CHANGES

## Trade-offs (커스텀-최소형 vs Buy)
- 정합성 리스크: 커스텀=다운로드 commit-order/내구성 outbox를 직접 책임(높음) · Buy=검증된 엔진에 외주(낮음).
- 종속/비용: 커스텀=종속 없음·런타임비 낮음 · Buy=벤더 종속·비용·데이터모델 결합.
- 도메인 적합: 커스텀=이벤트소싱 100% 맞춤·추상화 누수 없음 · Buy=이벤트를 row로 얹는 추상화 누수 가능.
- 출시속도: 커스텀=동기화 직접구현으로 지연 리스크 · Buy=오프라인큐/재전송/델타 기성 제공으로 빠름.
- 권한 스코프(H3): 커스텀=역할별 pull 필터 직접 구현 · Buy=row-level scope/규칙 기성 지원.
- 전환비용: 둘 다 sync port + vendor-neutral 이벤트 스키마면 어댑터 교체로 낮출 수 있음(synthesis 핵심).
