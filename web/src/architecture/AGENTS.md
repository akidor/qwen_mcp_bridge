# Architecture Agent Guide

이 문서는 `web/src/architecture/` 하위 작업에 적용되는 전용 지침입니다. 루트 `AGENTS.md`의 규칙을 상속하며, 여기서는 3D 구조도, 연결성 분석, 권장 링크 미리보기 작업의 추가 기준을 정의합니다.

## 파일별 책임

- `architectureData.ts`
  - 구조도의 source of truth입니다.
  - 노드, 링크, 클러스터, 색상, flow 순서를 정의합니다.
  - 노드/링크/클러스터를 추가하거나 수정하면 `architectureData.test.ts`도 함께 갱신합니다.

- `architectureGraph.ts`
  - 순수 그래프 분석 로직만 둡니다.
  - React, Three.js, DOM, CSS 의존성을 넣지 않습니다.
  - 연결성 severity, weak node/cluster, suggested links 같은 계산은 여기서 처리합니다.

- `ArchitectureView.tsx`
  - 3D 렌더링과 패널 UI만 담당합니다.
  - 분석 규칙을 컴포넌트 내부에 새로 만들지 말고 `architectureGraph.ts` 결과를 사용합니다.
  - Three.js geometry/material 수정 시 모바일과 데스크톱 프레이밍을 같이 확인합니다.

- `architectureData.test.ts`
  - 데이터 구조와 필수 링크/노드/클러스터 계약을 검증합니다.

- `architectureGraph.test.ts`
  - 연결성 분석, 오탐 방지 role, 권장 링크 계약을 검증합니다.

## 변경 원칙

- 구조 의미가 바뀌는 변경은 테스트를 먼저 작성합니다.
  - 새 노드/링크/클러스터: `architectureData.test.ts`
  - 새 분석 규칙/권장안: `architectureGraph.test.ts`
  - UI 표시만 바뀌는 경우에도 가능한 데이터/분석 계약을 먼저 고정합니다.
- 단순 degree만으로 취약성을 판단하지 않습니다.
  - `source`, `sink`, `guard`, `diagnostic`, `processor` 역할을 고려합니다.
  - 의도된 시작점/종착점/진단점이 weak로 잡히면 role부터 검토합니다.
- 기존 링크와 중복되는 suggested link를 만들지 않습니다.
- suggested link는 실제 `ARCH_LINKS`에 바로 반영하지 않습니다.
  - 먼저 ghost/preview 링크로 보여주고, 실제 구조 변경은 별도 커밋에서 처리합니다.
- `ArchitectureView.tsx`가 지나치게 커지고 있으므로, 새 분석 로직은 이 파일에 추가하지 않습니다.

## UI/3D 검증 기준

3D 구조도나 패널 UI를 수정한 경우 아래를 확인합니다.

- `cd web && npm run test`
- `cd web && npm run build`
- Playwright로 `http://localhost:4173` 진입 후 `3D 구조` 버튼 클릭
- 콘솔 error와 page error가 없는지 확인
- 데스크톱 screenshot 저장
- 모바일 viewport screenshot 저장
- canvas 영역 pixel nonblank 확인
- 다음 UI가 깨지지 않는지 확인
  - 레이어 on/off
  - cluster solo
  - 연결성 분석 카드
  - weak node list
  - 권장 보강 리스트
  - 권장 링크 미리보기 토글
  - 하단 flow strip

## 시각 디자인 기준

- 3D 노드는 기존 색상 체계 `KIND_COLORS`를 우선합니다.
- 취약/단절/권장 상태 색상은 `CONNECTIVITY_COLORS`를 우선합니다.
- 권장 링크는 실제 링크와 혼동되지 않게 ghost/dashed/amber 계열로 유지합니다.
- 레이어를 끄면 관련 노드와 링크는 완전 삭제보다 dim 처리합니다.
- 텍스트가 모바일 패널, 버튼, 카드 밖으로 넘치지 않게 합니다.
- 구조도 화면에 설명문을 과하게 추가하지 않습니다. 정보는 패널/카드에 압축해서 둡니다.

## 테스트 작성 기준

- `architectureGraph.test.ts`는 실제 `ARCH_NODES`, `ARCH_LINKS`, `ARCH_CLUSTERS`를 사용해 회귀를 잡습니다.
- 새 suggested link를 추가하면 최소한 아래를 검증합니다.
  - `from`
  - `to`
  - `source`
  - `confidence`
  - `curve`
  - 기존 링크와 중복되지 않는지
- 새 weak 판정 규칙을 추가하면 false positive가 될 수 있는 role도 같이 검증합니다.
- 테스트명은 “무엇을 오탐/탐지/제안하는지”가 드러나게 작성합니다.

## 완료 보고에 포함할 확인 포인트

이 디렉터리 작업을 마친 뒤 최종 응답에는 루트 `AGENTS.md`의 완료 보고 형식에 더해 아래 항목을 포함합니다.

- 구조도에서 사용자가 직접 눌러볼 버튼
  - 예: `3D 구조`, `권장 링크 미리보기`, `solo`, weak node 항목
- 직접 확인할 대표 노드/링크
  - 예: `design -> polygon`, `map -> web`
- 데스크톱/모바일 확인 여부
- canvas pixel nonblank 확인 여부
- 다음 작업 제안 1순위

## 다음 작업 후보

현재 구조도 기능의 다음 작업 후보는 아래 순서로 제안합니다.

1. 권장 링크를 `적용 예정` / `무시` / `보류` 상태로 관리하는 검토 워크플로우
2. Critical Path 모드: 사용자 요청부터 Map Renderer까지 핵심 경로 강조
3. 분석 프리셋: 운영 안정성, 시각화 안정성, 도구 호출 안정성 관점 분리
4. `ArchitectureView.tsx` 분리: scene, panels, flow strip, hooks로 파일 크기 축소
