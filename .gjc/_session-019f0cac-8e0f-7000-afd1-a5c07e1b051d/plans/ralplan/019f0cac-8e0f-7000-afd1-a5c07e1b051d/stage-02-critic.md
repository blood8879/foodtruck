# Critic 최종 평가 — 푸드트럭 메뉴·매출 MVP 구현계획 rev.3 (deliberate, stage_n=2)

## Verdict: OKAY — 실행 승인

rev.2에서 HIGH 3(H1 단조 커서·H2 이중 타임스탬프+세션 anchor·H3 역할별 pull 필터) + MEDIUM 5(M-ORD/OBX/VOID/MTL/GATE) + LOW 3이 전수 근본원인 수준으로 닫혔고 Architect2가 CLOSED 확인했다. rev.3는 Architect2가 신규로 짚은 N1~N4를 동일 원칙(이벤트 라이프사이클의 멱등·순서·권한 대칭)으로 전수 봉합했다. 남은 차단 사안 없음. 대표 구현 태스크 3건을 실제 스키마/골든에 시뮬레이션한 결과 추측 없이 착수 가능하다. → OKAY.

## 이전 지적 폐쇄 검증 (N1~N4)
- **N1 (세션 close orphan/멱등) — CLOSED.** 원칙4가 '주문/void/세션 open·close 모두 orphan 보류+event_id 멱등 라이프사이클 공유'로 일반화. Pre-mortem #6(M-VOID+N1), 데이터모델 BusinessSession close 이벤트 orphan+멱등, Unit 골든 '세션 close orphan/멱등', AC '(신규)세션 close orphan/멱등 라이프사이클 M1/M2 unit/integration'까지 일관. void와 대칭 적용 확인.
- **N2 (트럭당 활성 세션 1개 불변식) — CLOSED.** Decision Driver 1·Pre-mortem #7·데이터모델 Truck.active_session_id(파생)·동기화 전략·integration 골든 '2기기 동시 open→활성1개 수렴'·Observability '활성 세션 수 게이지'·AC 행까지 전수 반영. 소유권 규칙(가장 이른 UUIDv7 우선→후속 no-op·동일 session_id 흡수)이 구체적이고 UUIDv7 시간정렬 특성과 일관해 결정적(deterministic) 병합 보장.
- **N3 (알바 session_id 태깅 가능·매출유출0) — CLOSED.** 원칙5에 '세션 open 메타(매출 산출 필드 0)는 태깅용 허용' 예외 명문화로 권한 최소노출 원칙과 충돌 없이 닫음. Pre-mortem #3(H3/N3)·동기화 화이트리스트·M3 권한 완성·e2e '알바 pull 매출필드0 & session_id 태깅 가능'·AC 행 일관.
- **N4 (광고 오프라인/타임아웃 세션전환 비차단) — CLOSED.** 원칙6에 '광고는 어떤 경우에도 영업 흐름 차단 금지' 명문화. Pre-mortem #8 ad port 계약(timeout·offline-skip·세션전환 비차단/fail-open), M4 어댑터, e2e '오프라인/타임아웃에도 세션전환 비차단', Observability '광고 skip/timeout 카운터', AC 행 일관. offline-first 원칙2 위배 제거.

## 대표 태스크 시뮬레이션 (실제 스키마/골든 대조)
1. **M1 — BusinessSession open/close 라이프사이클.** open(event_id UUIDv7, truck_id, device_id, opened_by, 이중 타임스탬프)·close(event_id, target_session_id) 스키마 확정, 활성1개 불변식(이른 UUIDv7 병합), orphan 보류+멱등, Unit '세션 close orphan/멱등'·integration '2기기 동시 open→활성1개' 골든 명시 → 추측 없이 구현 가능. ✓
2. **M2 — 단조 pull 커서(H1).** high-water-mark=min(미commit seq) 미만만 확정(또는 commit_ts+overlap/논리복제 슬롯), sync port 추상화, 골든 'concurrent commit 누락0' 고정, 미통과 시 BUY 전환(M-GATE) → 설계+검증기준+탈출구 명확. ✓
3. **M3 — 역할별 pull 화이트리스트(H3/N3).** 알바=메뉴 마스터+자기주문+세션 open 메타(매출필드0), 타기기 주문·원가 박제·집계 미전송, e2e '매출유출0 & session_id 태깅 가능' → 데이터 경계까지 권한 강제 확인. ✓

## 기준별 평가
- **Clarity — 합격.** 원칙6·드라이버3·옵션·마일스톤 M1~M4·데이터모델·동기화 전략 명확. human-readable markdown(YAML-only 아님) 포맷 유효.
- **Verifiability — 합격.** AC 표 전 항목 마일스톤+검증계층 매핑, 신규 N1~N4 행 포함. HIGH/MEDIUM 실패모드를 통과시키던 stage1 검증 구멍이 골든으로 봉합됨.
- **Completeness — 합격.** H1~H3·M-*·N1~N4·LOW 전수 메커니즘·골든·observability·AC 매핑 존재. 누락 없음.
- **Big Picture — 합격.** 메뉴→POS→분석 의존순서, 세션/권한/entitlement cross-cutting, 수익화 seam 선매립이 MVP 범위와 정합. 광고/결제 M4 격리로 침습 없음.
- **Principle/Option Consistency — 합격.** stage1의 원칙5↔A-3 모순이 rev.2에서 해소됐고, rev.3는 원칙4(멱등 일반화)·5(세션 메타 예외)·6(비차단 광고)을 옵션·pre-mortem·골든과 대칭 정합화. 모순 없음.
- **Alternatives Depth — 합격.** build/buy A-1(BUY 권장)/A-2(BUILD 조건부) 구체 pros/cons+steelman 반영, M-GATE time-box 스파이크로 결정을 데이터 강제. 기술스택 B-1/B-2/B-3 탈락사유 구체.
- **Risk/Verification Rigor — 합격.** Pre-mortem 8 시나리오(3→8 확장) 각각 신호+완화+골든, 위험표가 전수 매핑. 확장테스트 4계층(unit/integration/e2e/observability)+상시 불변성 가드가 H/M/L/N 실패모드 전수 커버.

## 남은 필수 수정
없음. 차단 사안 0건. (handoff의 architect M2 차단형 리뷰·M-GATE 스파이크는 계획 내 정상 실행 게이트로, 본 평가의 승인을 막지 않음.)

## 명시적 승인
H1~H3, M-ORD/OBX/VOID/MTL/GATE, LOW, N1~N4 전수 CLOSED. rev.3는 추측 없이 실행 가능하고 검증 단계가 구체적이다. **M1 착수를 승인한다(OKAY).**

참조 검증: stage-03-revision.md / stage-02-architect.md / stage-01-critic.md 3건 대조 완료.
