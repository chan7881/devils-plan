# devils-plan — 작업 규칙

「데블스 플랜」 게임, 교실에서 따라하기 연수 자료의 진행 프로그램을 웹으로 모은 것.
배포: `https://chan7881.github.io/devils-plan/`

> 공통 규칙(결론을 미리 말하지 않기, 검증 절차, 화면·배포 규칙)은 **`../CLAUDE.md`**에 있다.
> 여기에는 이 리포에만 해당하는 것만 적는다.

## 구조

빌드 도구 없음. 순수 ES 모듈. circuit 리포와 같은 규격이되, **루트가 허브**다
(대표 게임이 따로 없어서다).

```
index.html · styles.css   허브
common/js/pieces.js       피스 배분 순수 로직 — 여러 게임이 공유
common/js/tests.js · common/test.html
<게임>/index.html          게임마다 한 폴더
```

새로 만드는 게임은 circuit의 분리 규격을 따른다 —
`js/<도메인>.js`(순수 로직, DOM 모름) + `js/main.js`(DOM을 만지는 유일한 파일) + `js/tests.js` + `test.html`.

## 이 리포에서만 주의할 것

### 이식해 온 셋은 손대지 않는다

`memory/` · `virus/` · `race/`는 연수 자료의 **단일 파일 HTML을 그대로** 옮긴 것이다.
인라인 `<script>` 하나에 전부 들어 있고, 잘 돌아간다. **리팩터링하고 싶어도 참는다** —
고쳐야 할 이유가 생겼을 때만 그 부분만 고친다.

지금까지 손댄 곳은 하나뿐이다: `memory/index.html`의 Google Fonts `@import` 제거
(→ `--font-body` / `--font-display` 시스템 폰트 스택). 학교 망 차단·오프라인 때문이다.
자체 호스팅은 Gamja Flower TTF가 12.6MB, woff2 서브셋이 369개라 포기했다.

### 폴더명은 ASCII 슬러그

한글 경로는 URL이 퍼센트 인코딩돼 QR·주소 공유가 지저분해진다.

### 규칙이 틀리면 잘못 가르치는 것이다

수식 계산·동물 조합 판정·순위 판정처럼 **정답이 정해져 있는 것**은 공통 규칙 2번의 7단계를
그대로 적용한다. 특히 **변이 검사** — 일부러 버그를 되돌린 복제본에서 그 테스트가 실패하는지
본다. `pieces.js`는 이미 두 가지 변이(`floor`→`ceil`, 동점조 피스 합산 제거)로 확인했고
둘 다 5건씩 실패했다.

규칙의 정본은 **G드라이브 원본**이다:
`G:\다른 컴퓨터\내 컴퓨터\항도중학교자료\데블스 플랜 게임, 교실에서 따라하기1`
- 피스 배분: `데블스 플랜 연수 피스 배분.hwp`
- 각 게임 규칙: 게임별 폴더의 설명 PPT
- 규칙 레이스 초능력 10종: `10대 고유 특수 능력 상세 설명(카드반드시사용버전).hwpx`

### 개인정보는 절대 넣지 않는다

원본 자료에는 실명·학교 전화번호·카톡 아이디·교사 휴대번호가 들어 있다
(`기억의 조각 문제답(2026.7.31 UPDATE).hwp`, 몽타주 PPT). **공개 리포이므로 옮기지 않는다.**
문제 세트가 필요하면 새로 만들거나 개인정보 없는 샘플만 넣는다.

원본 PPT·영상(수백 MB)도 리포에 넣지 않는다. G드라이브에 그대로 둔다.

### 브라우저 자동화로 확인할 때

`virus/`와 `race/variant-middle2.html`은 `alert`/`confirm`을 쓴다.
그냥 클릭하면 CDP가 멈춘다 — `window.confirm = () => true`, `window.alert = () => {}`로
스텁을 씌우고 클릭한다 (자세한 것은 `~/.claude/CLAUDE.md`).

## 테스트

```bash
node --input-type=module -e "
const m = await import('file:///<절대경로>/devils-plan/common/js/tests.js')
const r = m.runAll()
console.log('PASS ' + r.filter(x=>x.ok).length + ' / FAIL ' + r.filter(x=>!x.ok).length)
for (const x of r) if (!x.ok) console.log(x.label)"
```

⚠️ 결과 객체의 필드는 **`label`**이다(`message`가 아니다).

## 배포 확인

번들이 아니라 파일을 그대로 올리므로 함수명으로 볼 수 있다.
다만 공통 규칙 6번대로 **그 이름이 이번에 처음 생긴 것인지** 먼저 확인하고,
마지막에는 실제 화면을 눈으로 본다.

```bash
curl -s https://chan7881.github.io/devils-plan/common/js/pieces.js | grep <바꾼_함수명>
```
