# 작은 기록 — 나루 데이터베이스 예제

글 목록·상세·방명록·관리자 편집과 비공개 초안을 갖춘 정적 웹사이트입니다.
SDK 1.0.0을 쓰며 빌드나 설치가 필요 없습니다.
안내: https://naru.pub/docs/database

## 설치

1. https://naru.pub/database 에서 컬렉션 세 개를 만드세요.
   - posts: 읽기 누구나, 쓰기 관리자만
   - guestbook: 읽기 누구나, 쓰기 누구나 생성만
   - drafts: 읽기 관리자만, 쓰기 관리자만
2. '웹사이트 관리자 로그인'에 올릴 위치의 admin.html 주소를 등록하고 posts와 drafts를 고르세요.
   예: https://내사이트.naru.pub/admin.html 또는 https://내사이트.naru.pub/blog/admin.html
3. 연결한 도메인에 올린다면 config.js의 site에 나루 로그인 이름을 적으세요.
   내사이트.naru.pub에서는 그대로 두면 됩니다.
4. 모든 파일을 같은 폴더에 올리고 호스팅된 index.html을 여세요. file://로는 동작하지 않습니다.

## 쓰는 법

- 쓰기 → 나루로 로그인 → 승인한 뒤 제목, 본문, 분류(선택)를 적으세요.
- '초안 저장'은 drafts에 저장합니다. 방문자에게 보이지 않습니다.
- '공개'는 posts에 저장하고 초안을 지웁니다. 한 트랜잭션이라 둘 다 되거나 둘 다 안 됩니다.
- '저장한 글'에서 글이나 초안을 불러와 고치거나 지우세요.
- 방명록 관리는 제어판에서 합니다.

## 파일

- config.js / client.js: 사이트 설정과 SDK 연결
- index.html / guestbook.html / list.js: 글 목록과 방명록
- post.html / post.js: 글 상세
- admin.html / admin.js / editor.js: 로그인, 편집, 초안, 공개, 삭제
- utils.js / style.css: 공통 UI

방문자 입력은 textContent로만 표시합니다. 관리자 페이지에는 신뢰하는 스크립트만 넣고,
공용 기기에서는 로그아웃하세요. 여러 탭에서 같은 글을 동시에 고치면 마지막 저장이 남습니다.
