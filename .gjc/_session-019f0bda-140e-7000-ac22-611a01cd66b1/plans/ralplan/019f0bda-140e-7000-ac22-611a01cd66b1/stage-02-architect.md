# Architect 재리뷰 — 푸드트럭 MVP 구현계획 rev.2 (stage_n 2)

## Summary
rev.1에서 제기한 HIGH 3 + MEDIUM 5 + LOW 3을 rev.2가 **전수 근본원인 수준에서 해소**했다. 단조 high-water-mark 커서(H1), 이중 타임스탬프+BusinessSession 경계 anchor(H2), 서버 역할별 pull 필터(H3) 모두 closed. 다만 신규 통합(영업세션 이벤트 라이프사이클, 광고 오프라인 동작)에서 **MEDIUM 3건의 잔존/신규 위험**이 발생 — M1 착수는 무방하나 M2(동기화) 전에 명세 보강 필요. → WATCH / COMMENT.

## Analysis (직전 findings 판정)

### HIGH
- **H1 (cursor commit-order 유실) — CLOSED.** last_seq 단순 커서 폐기, min(미commit seq) 미만만 확정하는 단조 high-water-mark(또는 commit_ts+overlap 재조회/논리복제 슬롯)로 재설계. '무충돌=병합'과 '다운로드 정합성=별개'를 정확히 분리. 기본 기울기 BUY 전환 + 골든 'concurrent commit 누락0'. 근본원인 정조준.
- **H2 (시계스큐 날짜귀속) — CLOSED(조건부).** device_created_at+server_received_at 이중보관, 오프셋 추정·임계 플래그, BusinessSession open~close를 영업일 경계 anchor로 채택, 타임존 명문화, 골든 '+6h 스큐 동일세션'. 주문은 timestamp 비교가 아니라 explicit session_id 참조로 귀속되어 견고. 단, anchor 메커니즘 자체의 멀티기기 의미론이 신규 MEDIUM(N2)으로 잔존 — 'closed in principle, M2에서 N2 동반 확정 필요'.

### MEDIUM
- **M-ORD (비원자 주문) — CLOSED.** payload.lines[] 단일 불변 이벤트 봉투, 라인은 프로젝션. 부분도착 제거.
- **M-OBX (이중쓰기) — CLOSED.** outbox를 event(seq=null)에서 파생, 단일 SQLite 트랜잭션 커밋. dual-write 제거 + 크래시 정합 골든.
- **M-VOID (orphan/중복 void) — CLOSED.** orphan은 보류큐→target 도착시 적용, 동일 event_id 멱등 1회 차감. unit 골든.
- **M-MTL (manual_total fold) — CLOSED.** gross=manual_total 우선/없으면 라인합, cost=Σ라인 unit_cost, void 전부 제외, 순위=박제 menu·매출액 기준. fold 규칙 확정.
- **M-GATE (build/buy 게이트) — CLOSED.** sync port + vendor-neutral 스키마 M1부터, 사전 판정기준(H1/M-OBX/H3 골든+운영비용) 문서화, M2 착수 즉시 time-box 스파이크, 기본 BUY.

### LOW — 전부 반영
per-event lateness(pull/observability 표시), truck_id 스코프 강제(쿼리·동기화 규칙 필수), 박제 menu 순위(박제 menu 기준 매출액 지표).

## Findings (잔존/신규)

- **N1 (MEDIUM) — 세션 close 이벤트의 orphan/중복 처리 미명세.** close는 target_session_id를 참조하는 보상성 이벤트라 M-VOID와 동일한 'orphan(open 전 도착)/중복 수신' 위험을 가지나, 계획은 void에만 보류큐·멱등을 명시하고 세션 close에는 미적용. 영향: SessionSummary/날짜경계 흔들림. Fix: void와 동일하게 close에 orphan 보류큐 + close event_id 멱등(1회 적용) 적용, 골든 추가.
- **N2 (MEDIUM, H2 종속) — 멀티기기 세션 소유권/동시 open 의미론 미정의.** open이 device_id를 보유하나, 두 기기가 각각 open하면 한 영업일에 세션 2개가 생겨 H2 anchor와 SessionSummary가 갈라질 수 있음. Fix: 트럭 단위 '활성 세션 1개' 불변식(서버 권위적 session 합치/중복 open 거부 또는 동일 영업일 병합 규칙) 명세 + integration 골든.
- **N3 (MEDIUM) — H3 pull 필터의 세션 이벤트 열거 누락.** 알바는 주문에 session_id를 태깅해야 하므로 BusinessSession open 이벤트가 알바 기기로 내려와야 하나, H3 필터 정의('메뉴 마스터+자기주문만')에 세션 이벤트가 빠져 있음. 매출 산출 불가한 세션 메타(open만, 집계 제외)는 허용 화이트리스트에 명시 필요. Fix: 역할별 pull 화이트리스트에 '세션 open(매출필드 없는 메타)' 포함을 명문화, e2e에 '알바가 현재 session_id 획득 가능 & 매출필드 0' 추가.
- **N4 (LOW) — 광고 슬롯의 오프라인 비차단/실패-오픈 미명세.** 광고는 세션 open/close 인터스티셜인데, 오프라인에서 ad SDK 호출이 세션 open/close를 차단하면 offline-first 원칙2 위배. M4·ad port 뒤라 위험 격리는 양호하나, 'ad는 timeout/skip-on-offline, 세션 전환을 절대 차단 안 함(fail-open)'을 ad port 계약에 못박을 것. (entitlement는 plan_tier가 Truck 로컬값이라 오프라인 평가 가능 — 양호.)

## Root Cause
직전 라운드의 근본원인(다운로드 비단조 유실, 시계 기반 날짜귀속, 클라이언트 측 권한은닉)은 모두 데이터 경계/순서/시계라는 분산시스템 1차 원인에서 정확히 해소됨. 신규 위험 N1~N3은 동일 원인계열(이벤트 라이프사이클의 멱등·순서·권한 일관성)을 '세션 이벤트'에 아직 일관 적용하지 않은 데서 발생 — 계획이 세운 원칙(M-VOID/H3)을 세션 이벤트에까지 대칭 적용하면 닫힌다.

## Recommendations
1. (M2 차단형) N2 멀티기기 세션 불변식 + N1 세션 close orphan/멱등을 H2 골든과 함께 확정.
2. (M3 전) N3 역할별 pull 화이트리스트에 세션 메타 명시 + e2e 보강.
3. (M4) N4 ad port 계약에 fail-open/offline-skip 명문화.
4. 나머지는 계획대로 진행. M1(메뉴+POS+세션+로컬 fold+seam)은 잔존 findings의 차단 없이 착수 가능.

## Architectural Status
WATCH

## Code Review Recommendation
COMMENT

## Trade-offs
- BUY(PowerSync 등) vs BUILD(커스텀 단조커서): 계획의 'sync port로 결정 격리 + 기본 BUY, 골든 전수통과 시 BUILD 조건부'는 리스크-속도 균형상 타당. M-GATE의 time-box 스파이크가 결정을 데이터로 강제하므로 수용.
- 세션 anchor(H2) vs 순수 server_received_at: 세션 anchor가 심야영업 UX엔 정확하나 멀티기기 소유권 복잡도(N2)를 새로 들임 — 트럭당 활성세션1 불변식으로 복잡도 통제 가능하면 anchor 유지가 우월.
