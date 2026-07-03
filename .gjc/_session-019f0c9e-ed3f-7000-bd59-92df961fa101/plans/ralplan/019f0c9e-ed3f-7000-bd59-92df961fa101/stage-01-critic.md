# Critic 평가 — 푸드트럭 메뉴·매출 MVP 구현계획 (deliberate, stage_n=1)

## Verdict: ITERATE (Architect REQUEST CHANGES / 3 HIGH 반영)

계획의 골격(이벤트소싱·로컬우선·박제·멱등·권한최소노출 원칙, 메뉴→POS→분석 의존순서, M1~M3 계층화, 14개 AC→마일스톤 매핑)은 도메인에 정확히 들어맞고 포맷·참조 무결성도 통과한다. 그러나 (1)프로젝트 1순위 AC(오프라인 다중기기 무손실 병합)를 보증하는 메커니즘이 실제로는 결함(H1 commit-order), (2)자기 원칙5(권한 최소노출)를 자기 권장안(A-3 전체 이벤트 복제)이 정면 위배(H3), (3)최상위 pre-mortem 시나리오의 완화책이 기술적으로 틀림(시나리오1이 H1을 일으키는 바로 그 last_seq 커서를 해법으로 제시) — 이 셋은 실행 전 반드시 닫아야 한다. 아키텍처를 뒤집을 사안은 아니므로(Architect WATCH) REJECT가 아닌 ITERATE: Planner 1회 리파인으로 스키마·동기화 계약을 보강한 뒤 실행 게이트 통과.

## 기준별 평가

### 1. Principle–Option 일관성 — 미흡 (BLOCK급)
- **위배**: 원칙5 '권한 최소노출(클라 숨김만으로 끝내지 않음)' vs 권장안 A-3 동기화 전략('truck 단위 전체 이벤트 로그 전파'). 알바 기기에 unit_cost 박제·전체 주문이 복제되면 UI/API를 막아도 클라에서 매출·순이익 직접 계산 가능 → 동기화 자체가 유출 API. 원칙과 권장 옵션이 모순(Architect H3).
- 원칙1(이벤트소싱)·원칙2(로컬우선)·원칙3(박제)·원칙4(멱등)는 옵션 선택과 일관. 단 원칙5만 옵션 설계와 충돌.

### 2. 공정한 대안 평가 (build/buy·기술스택) — 부분 미흡
- 기술스택 B-1/B-2/B-3: 탈락 사유(B-3 오프라인 신뢰성, B-2 분석/코어공유 약점)가 구체적·공정. 합격.
- build/buy A-1/A-2/A-3: 옵션 나열은 충실하나 권장(A-3 커스텀)의 정당화가 편향. '범용 sync는 mutable-row 충돌용 무게이고 우리는 append-only라 불필요'라는 논거는 sync 라이브러리 가치의 다수(크래시내성 outbox·다운로드 commit-order 가시성·테넌트/권한 스코프)를 누락 — 즉 제거했다고 본 복잡도(충돌해결)는 애초 우리 리스크가 아니었고, 진짜 리스크(다운로드 정합성·권한 스코프)는 그대로 남음. Architect steelman 미반영.
- 게이트(M-GATE): '결정을 M2에서'는 결정을 매몰비용 최고점(저장층 sync 결합 후)으로 미룸. 공정 비교 불가 구조.

### 3. 위험 완화 명확성 — 미흡
- 위험 항목 존재하나 최상위 리스크 완화가 **기술적으로 틀림**: pre-mortem 시나리오1 완화책 'pull은 last_seq 커서 기반'이 곧 H1(서버 seq auto-increment 시 commit 순서 역전→seq 갭 영구 유실)의 원인. 완화책이 결함을 봉인하지 못함.
- H2(기기 시계 스큐 날짜 귀속) 완화 부재: 계획은 created_at(기기 로컬시계)에 날짜를 전적 귀속, 서버 교정 경로 없음. pre-mortem에 시계스큐 시나리오 자체가 없음.
- H3 완화 부재: 위험 '권한 우회'는 UI/API 가드만 다루고 동기화 데이터 유출 경로 미언급.

### 4. 테스트 가능한 Acceptance Criteria — 부분 미흡
- AC→마일스톤→검증 매핑 테이블 존재, 14개 전부 매핑 → 추적성 합격.
- 그러나 핵심 AC의 검증 정의가 실패모드를 못 덮음: '2기기 무손실 합산→integration 병합 골든'은 **concurrent commit-order 누락 케이스 미포함**, '지각동기화 날짜귀속→integration'은 **시계 스큐 케이스 미포함**, 권한 e2e는 **동기화 스코프 유출 미검증**. ACs는 testable하나 테스트가 HIGH 실패경로를 통과시킴.

### 5. 구체적 검증 단계 (확장 테스트: unit/integration/e2e/observability) — 부분 미흡
- 4계층(unit/integration/e2e/observability) + 불변성 가드(상시) 모두 존재 → 구조는 강함. 누락이 아닌 '구멍'이 문제.
- 미커버 골든(필수 추가): (a)H1 동시 commit 시 누락0, (b)H2 시계 스큐 하 날짜 귀속 교정, (c)H3 알바 pull scope에 타기기 원가/주문 미수신, (d)M-ORD 주문+라인 원자 전송(부분실패 시 라인없는 주문 0), (e)M-OBX 단일 트랜잭션 outbox(이벤트 commit=outbox 파생), (f)M-VOID orphan void 보류·중복 void 멱등, (g)M-MTL manual_total fold 규칙(gross/net/순위 산식).

### Pre-mortem 평가 (deliberate 필수) — 약함
- 3 시나리오 존재(무손실 병합/박제 깨짐/권한 우회) → 개수 요건 충족.
- 그러나 (1)시나리오1 완화가 틀림(상기), (2)시계 스큐(H2)·동기화 유출(H3)·주문라인 비원자(M-ORD)·이중쓰기(M-OBX)·orphan void(M-VOID) 등 Architect가 짚은 실존 실패경로가 시나리오에 부재. 깊이 부족.

### 확장 테스트 계획 평가 (deliberate 필수) — 약함
- 4계층 구조는 양호하나 위 (a)~(g) 골든 부재로 HIGH/MEDIUM 실패모드 미검증. 보강 필요.

## 필수 수정 요구 (실행가능)

### MUST (실행 전 차단 — HIGH)
1. **H1 다운로드 정합성**: pull 커서를 commit-order 단조 보장으로 재설계(논리복제 슬롯 / commit시각+overlap 재방문 window / high-water-mark=min(미commit txn)). pre-mortem 시나리오1 완화책을 이 설계로 교체. 'concurrent commit 누락0' 골든을 M2 첫 슬라이스에 고정. 확정·테스트 불가 시 BUY 전환.
2. **H3 권한 스코프**: 서버측 pull scope를 역할별 필터로 명문화(알바 기기=메뉴 마스터+자기 주문작성 데이터로 한정, 타기기 주문/원가 박제 미전송). 원칙5와 옵션 설계 정합화. e2e에 '알바 pull에 원가/타기기주문 0건' 추가.
3. **H2 날짜 귀속**: 이벤트에 device created_at + server received_at 동시 보관, 클라-서버 오프셋 추정/임계초과 플래그, 영업일 경계·타임존(심야 자정넘김) 명문화. integration에 시계스큐 날짜귀속 골든 추가.

### SHOULD (실행 전 권장 — MEDIUM)
4. **M-ORD**: 주문+라인을 단일 불변 이벤트 봉투(payload 라인배열)로 원자 전송, 라인 테이블은 프로젝션으로만. 데이터모델 섹션 수정.
5. **M-OBX**: event(seq null) 파생 outbox로 dual-write 제거, 단일 SQLite 트랜잭션. 동기화 섹션 수정.
6. **M-VOID**: fold가 orphan void 보류→target 도착 시 적용, void 멱등(이미 취소면 무효과) 명문화. unit 골든 추가.
7. **M-MTL**: manual_total fold 규칙 확정(gross=manual_total 우선·없으면 라인합, cost=라인 unit_cost 합, 순위=수량 또는 라인매출 택1). AC '총액 수동조정' 검증을 이 규칙으로 구체화.
8. **M-GATE**: M1에서 sync를 port(헥사고날)로 추상화·이벤트 스키마 vendor-neutral 확정, BUY 스파이크를 M2 착수 즉시 time-box, 판정기준(누락0 골든 통과·구현/운영비 임계·SDK 모바일+웹 적합)을 지금 문서화. '느슨한 M2 판정' 제거.

### NICE (LOW)
9. late_synced per-event 단위화(L-LATE), truck_id 스코프 fold/쿼리 강제(L-TEN), 메뉴순위 박제 menu 기준 유지(L-RANK).

## 다음 리파인(Planner 수정)이 반드시 닫아야 할 항목
- [ ] H1 commit-order 단조 커서 설계 확정 + pre-mortem 시나리오1 완화책 교체 + 'concurrent commit 누락0' 골든 명시 (또는 BUY 확정)
- [ ] H3 역할별 pull scope 설계 + 원칙5↔옵션 정합화 + 알바 pull 유출 e2e
- [ ] H2 device/server 이중 타임스탬프 + 영업일/타임존 명문화 + 시계스큐 날짜귀속 골든
- [ ] pre-mortem에 시계스큐·동기화유출·비원자주문·이중쓰기·orphan void 시나리오 보강(깊이)
- [ ] 확장 테스트에 (a)~(g) 골든 추가 — HIGH/MEDIUM 실패모드 전수 커버
- [ ] M-ORD/M-OBX/M-VOID/M-MTL 데이터모델·동기화·fold 규칙 명문화
- [ ] M-GATE: sync port 추상화 + vendor-neutral 이벤트 스키마 + 사전 판정기준 + M2 즉시 time-box

## Summary
- Clarity: 합격 (원칙·순서·마일스톤 명확, 포맷 유효)
- Verifiability: 부분미흡 (AC 추적성 양호하나 HIGH 실패모드 검증 구멍)
- Completeness: 부분미흡 (H1/H2/H3 메커니즘 공백, MEDIUM 4건 미정의)
- Big Picture: 합격 (메뉴→POS→분석 의존순서·권한 cross-cutting 타당)
- Principle/Option Consistency: 미흡 (원칙5 vs A-3 모순 — H3)
- Alternatives Depth: 부분미흡 (build/buy 권장 정당화 편향, steelman 미반영, 게이트 느슨)
- Risk/Verification Rigor: 미흡 (최상위 완화책 기술적 오류, pre-mortem 깊이·테스트 골든 부족)

참조 파일 검증: stage-01-planner.md / stage-01-architect.md / specs/deep-interview-foodtruck-menu-sales-mvp.md 3건 모두 읽고 대조 완료. 계획은 human-readable markdown(YAML-only 아님) → 포맷 유효. 명세 14개 AC 전수 매핑 확인.
