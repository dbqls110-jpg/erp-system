# VenueDA ↔ ERP 메신저 연동

VenueDA 방문자 상담은 ERP 내부 직원 대화와 분리된 `venue_da_threads` / `venue_da_messages`에 저장하고, ERP 메신저 목록에서는 `VenueDA` 배지로 함께 보여 준다.

## 운영 환경변수

Render Web Service에 아래 값을 등록한다.

| 이름 | 값 |
| --- | --- |
| `VENUEDA_BASE_URL` | `https://venueda.pages.dev` |
| `VENUEDA_INTEGRATION_SECRET` | VenueDA Production의 `ERP_AGENT_API_KEY`와 같은 값 (비밀값) |
| `VENUEDA_DEFAULT_ASSIGNEE_EMAIL` | 기본 담당자 ERP 계정 이메일 |

비밀값은 Git, 문서, 채팅, 로그에 기록하지 않는다. `render.yaml`에는 `sync: false`만 두고 Render 대시보드에서 직접 입력한다.

## VenueDA → ERP

모든 요청은 `Authorization: Bearer <공유 secret>` 헤더와 JSON 본문을 사용한다.

- `POST /api/public/inquiry-threads`: 상담방 생성/재전송
  - 필수: `threadId`
  - 선택: `memberId`, `memberEmail`, `subject`, `context`
- `POST /api/public/inquiry-threads/{threadId}/messages`: 방문자 메시지 저장
  - `messageId`(또는 `clientMessageId`), `body`, `authorId`, `authorName`, `attachments`

`messageId`가 같은 요청은 중복 저장하지 않는다. 첨부파일은 현재 파일 자체가 아니라 ID·이름·MIME·용량 메타데이터만 보존한다.

## ERP → VenueDA

관리자가 ERP 메신저에서 VenueDA 상담에 답하면 ERP 서버가 다음 VenueDA API를 호출한다.

`POST /api/internal/erp/inquiry-threads/{VenueDA threadId}/messages`

ERP 서버에서만 `Authorization: Bearer <공유 secret>`를 전송한다. 브라우저에는 secret을 내려보내지 않는다. 전달 실패 시 ERP에 `failed` 상태와 마지막 오류가 남아 재시도 원인을 확인할 수 있다.

## 배포 및 확인

1. `prisma migrate deploy`가 포함된 Render 빌드로 배포한다.
2. 빌드 로그에서 `20260917100000_add_venue_da_messenger` migration 적용을 확인한다.
3. VenueDA 테스트 계정으로 상담방을 만들고 메시지를 보낸다.
4. ERP 메신저에 `VenueDA` 대화와 미읽음 배지가 나타나는지 확인한다.
5. ERP 답변이 VenueDA 방문자 화면에 표시되는지 확인한다.

실제 문의·답변 테스트는 운영 데이터가 생성되므로 테스트 계정과 테스트 문구로만 수행한다.
