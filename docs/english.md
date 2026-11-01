# 英語学習

表現、教材の URL、文法の質問、英作文の添削、課題を残す画面です。LIFEMANAGER と同じ Supabase、同じログイン、同じ GitHub Pages です。予定の画面とはアドレスだけ分かれています。

公開 URL は `https://karasawhatup.github.io/lifemanager/english/` です。予定アプリのメニュー **英語学習** からも開けます。

時刻の基準は **Asia/Tokyo** です。日付の列（`learned_on`、`recorded_on`、`due_on`）は日本のカレンダー日です。

目標は、毎日1時間以上、単語・英作文・リスニング・スピーキングを続けることです。学習の「時間の枠」は、これまでどおり予定のカテゴリ `english` です。この画面は、その中身を残す場所です。

## 一度だけやること

予定アプリの `supabase/schema.sql` とログインは、すでに済んでいる前提です。`config.js` は変更しません。anon key も service_role も、この作業では触りません。

1. この変更を `main` にマージする。GitHub Actions の Deploy が終わるまで待つ。
2. [Supabase](https://supabase.com) の、いま LIFEMANAGER で使っているプロジェクトを開く。
3. **SQL Editor** → **New query**。
4. リポジトリの [`supabase/english_schema.sql`](../supabase/english_schema.sql) を開き、中身を**全部**貼り付けて **Run**。
5. 成功すれば **Table Editor** に次の5つがある。
   - `eng_expressions` 表現・単語
   - `eng_resources` 教材の URL
   - `eng_questions` 質問
   - `eng_essays` 英作文
   - `eng_assignments` 課題
6. iPhone の Safari か PC のブラウザで `https://karasawhatup.github.io/lifemanager/english/` を開く。
7. 予定アプリでログインした同じブラウザなら、そのままいきます。まだなら、画面のログインに**同じメールアドレスとパスワード**を入れます。ログアウトも共通です。

この SQL は、既存の予定・Todo・設定などの表と、その中のデータを変更しません。もう一度 Run しても、入っている英語の記録は消えません。

最後に publication が無いという notice が出たときだけ、**Database → Publications** で上の5つの表を有効にしてください。ボットが書き換えたとき、開いている画面が追随します。

## 画面

スマホは下のナビゲーションバー、横幅 600px 以上は左のレールです。追加は右下の ＋ です。課題だけはチューターが作るので、＋ はありません。

| 画面 | 何をするか |
| --- | --- |
| ホーム | 今日の学習、未対応の件数（未回答の質問、添削待ちの作文、フィードバック待ち）、未提出の課題 |
| 表現 | 使った単語や表現。表現、意味、例文、タグ、日付 |
| 教材 | 学習に使った記事・動画・その他の URL。タイトル、種類、メモ、日付、誰が追加したか |
| 質問 | 文法や表現の質問。状態は `open`（未回答）か `answered`（回答済み）。答えはあとから入る |
| 作文 | 英文を提出する。添削が来ると、原文と添削を並べ、単語の差分と日本語の説明を出す |
| 課題 | タイトル、指示、期限。状態は `assigned`（未提出）→ `submitted`（提出済み）→ `reviewed`（フィードバック済み）。答えはこの画面で出す |

入力欄は、iPhone で拡大しない文字サイズです。画面上下の安全領域（ノッチ、ホームバー）にも余白があります。

ホーム画面に置くとき: Safari で上の URL を開き、共有 → **ホーム画面に追加**。名前は「英語学習」です。

## デモモード

`public/config.js` の URL と鍵が空なら、デモモードです。サンプルの表現、教材、質問、作文、課題が、そのブラウザの中だけに保存されます。サーバーには送られません。右上のメニューの **サンプルに戻す** で最初の状態に戻せます。予定アプリの「サンプルに戻す」とは別です。

## 誰が何を書くか

ボットは予定アプリと同じく **service_role** で REST API を叩きます。この鍵は RLS を通り抜けるので、役割ごとにデータベースのユーザーは分かれていません。仕事の範囲は次のとおりです。書くときは、自分の役割を列に入れてください。

| 役割 | 値 | 仕事 |
| --- | --- | --- |
| 本人（アプリ） | `app` | 表現、URL、質問、作文を書く。課題の答えを提出する |
| チューター | `tutor` | すべて。質問に答える。課題を作り、フィードバックを書く。表現や URL も足せる。作文の添削もできる |
| ライター | `writer` | 英作文を添削する。添削文と、日本語の説明 |
| リサーチャー | `researcher` | 教材の URL を記録する |

`owner_id` を入れ忘れると、ログインした画面には出ません。`created_at` と `updated_at` は自動です。送らなくてよいです。

## ボット向け API

ベース URL は `$SUPABASE_URL/rest/v1/<テーブル名>` です。予定アプリのボットと同じ鍵です。

```bash
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="service_role の鍵。公開しない"
export OWNER_ID="auth.users の uuid"
```

環境変数が無いときは、`ENG_CREDENTIALS` のファイルを読みます。指定が無ければ `/home/box/agent-data/lifemanager/credentials.env` です。ファイルには同じ3つの変数を書いてください。鍵は画面にもログにも出ません。

ヘルパーは [`scripts/eng.sh`](../scripts/eng.sh) です。パスと JSON の中の `$OWNER_ID` は、その UUID に置き換わります。

```bash
scripts/eng.sh GET  'eng_questions?owner_id=eq.$OWNER_ID&status=eq.open&order=created_at.asc'
scripts/eng.sh POST eng_resources '{"owner_id":"$OWNER_ID", ...}'
scripts/eng.sh PATCH 'eng_essays?id=eq.ESSAY_ID&owner_id=eq.$OWNER_ID' '{...}'
scripts/eng.sh DELETE 'eng_resources?id=eq.RESOURCE_ID&owner_id=eq.$OWNER_ID'
```

curl を直接使うときのヘッダーは、予定アプリと同じです。

```text
apikey: $SUPABASE_SERVICE_ROLE_KEY
Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY
```

書き込みにはさらに `Content-Type: application/json` と `Prefer: return=representation` を付けます。`eng.sh` はこれを付けます。

### チューター

5つの表を読んで、質問・課題・表現・URL・作文のどれにも書けます。朝は次を見ると、未対応が分かります。

```bash
scripts/eng.sh GET 'eng_open_questions?owner_id=eq.$OWNER_ID&order=created_at.asc'
scripts/eng.sh GET 'eng_pending_essays?owner_id=eq.$OWNER_ID&order=created_at.asc'
scripts/eng.sh GET 'eng_unsubmitted_assignments?owner_id=eq.$OWNER_ID&order=due_on.asc'
scripts/eng.sh GET 'eng_submitted_assignments?owner_id=eq.$OWNER_ID&order=submitted_at.asc'
scripts/eng.sh GET 'eng_today_expressions?owner_id=eq.$OWNER_ID&order=created_at.desc'
scripts/eng.sh GET 'eng_today_resources?owner_id=eq.$OWNER_ID&order=created_at.desc'
```

今日の質問と作文は、東京の日付で区切ります。URL では `+` を `%2B` にします。

```bash
scripts/eng.sh GET 'eng_questions?owner_id=eq.$OWNER_ID&created_at=gte.2026-11-01T00:00:00%2B09:00&created_at=lt.2026-11-02T00:00:00%2B09:00&order=created_at.asc'
```

#### 表現を足す

| 列 | 内容 |
| --- | --- |
| term | 表現・単語。1〜200文字 |
| meaning | 意味。1〜1000文字 |
| example | 例文。無くてよい。2000文字まで |
| tags | 文字列の配列。16個まで。例 `["句動詞","学習"]` |
| learned_on | `YYYY-MM-DD`。東京の日付。省略すると今日 |
| created_by | `tutor` |

```bash
scripts/eng.sh POST eng_expressions '{
  "owner_id": "$OWNER_ID",
  "term": "look forward to",
  "meaning": "〜を楽しみに待つ。to の後ろは名詞か ing",
  "example": "I look forward to speaking with you.",
  "tags": ["前置詞", "句"],
  "learned_on": "2026-11-01",
  "created_by": "tutor"
}'
```

curl の場合:

```bash
curl -s "$SUPABASE_URL/rest/v1/eng_expressions" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "owner_id": "'"$OWNER_ID"'",
    "term": "look forward to",
    "meaning": "〜を楽しみに待つ。to の後ろは名詞か ing",
    "example": "I look forward to speaking with you.",
    "tags": ["前置詞", "句"],
    "learned_on": "2026-11-01",
    "created_by": "tutor"
  }'
```

#### 質問に答える

未回答のあいだ `answer` と `answered_by` は空です。答えるときは **1回の PATCH** で、`status` を `answered` にし、`answer` と `answered_by` を一緒に入れます。片方だけだと制約 `eng_questions_answer_pair` で断られます。

| 列 | 内容 |
| --- | --- |
| question | 本人の質問。1〜4000文字 |
| status | `open` または `answered` |
| answer | 回答。回答済みなら必須。8000文字まで |
| answered_by | `tutor`、`writer`、`researcher`。質問への回答はチューターの仕事 |
| created_by | 質問を書いた人。本人なら `app` |

```bash
scripts/eng.sh PATCH 'eng_questions?id=eq.QUESTION_ID&owner_id=eq.$OWNER_ID' '{
  "status": "answered",
  "answer": "to は前置詞です。後ろは see ではなく seeing です。I look forward to seeing you.",
  "answered_by": "tutor"
}'
```

#### 課題を出す

新しく作るときは `status` を `assigned` にし、`answer` と `feedback` と `reviewed_by` と `submitted_at` は入れません（空のまま）。

| 列 | 内容 |
| --- | --- |
| title | 1〜200文字 |
| instructions | 指示。1〜8000文字 |
| due_on | `YYYY-MM-DD` か null |
| status | `assigned`（未提出）、`submitted`（提出済み）、`reviewed`（フィードバック済み） |
| answer | 本人がアプリで提出した答え |
| feedback | フィードバック。レビュー済みなら必須 |
| reviewed_by | `tutor`、`writer`、`researcher` |
| submitted_at | 提出時刻。本人が提出すると入る |
| created_by | 課題を作った人。チューターは `tutor` |

```bash
scripts/eng.sh POST eng_assignments '{
  "owner_id": "$OWNER_ID",
  "title": "シャドーイングで聞いた表現を3つ",
  "instructions": "今日の動画で印象に残った表現を3つ書き、それぞれ例文を1つ作ってください。",
  "due_on": "2026-11-04",
  "status": "assigned",
  "created_by": "tutor"
}'
```

本人がアプリで提出すると `status` が `submitted` になり、`answer` と `submitted_at` が入ります。フィードバックは **1回の PATCH** で、`status`、`feedback`、`reviewed_by` を一緒に書きます。`answer` と `submitted_at` はそのまま残します。制約名は `eng_assignments_flow` です。

```bash
scripts/eng.sh PATCH 'eng_assignments?id=eq.ASSIGNMENT_ID&owner_id=eq.$OWNER_ID' '{
  "status": "reviewed",
  "feedback": "3つの表現はどれも会話で使えます。2文目の時制だけ、昨日の話なら過去形にしてください。",
  "reviewed_by": "tutor"
}'
```

提出済みだけ読む短縮は `GET /rest/v1/eng_submitted_assignments?owner_id=eq.$OWNER_ID` です。

#### 作文を添削する（チューターも可）

ライターの節と同じ PATCH です。`corrected_by` は `tutor` または `writer` です。

### ライター

仕事は英作文の添削です。未添削を読み、添削文と日本語の説明を書きます。

```bash
scripts/eng.sh GET 'eng_pending_essays?owner_id=eq.$OWNER_ID&order=created_at.asc'
```

| 列 | 内容 |
| --- | --- |
| title | タイトル。200文字まで。空でもよい |
| original_text | 本人の英文。1〜8000文字 |
| corrected_text | 添削後の英文。添削済みなら必須 |
| explanation | 日本語の説明。添削済みなら必須。8000文字まで |
| status | `pending` または `corrected` |
| corrected_by | `writer` または `tutor` |
| created_by | 書いた人。本人なら `app` |

`pending` のあいだ、添削の3列は空です。添削するときは **1回の PATCH** で4つを一緒に入れます。制約名は `eng_essays_corrected_pair` です。

```bash
scripts/eng.sh PATCH 'eng_essays?id=eq.ESSAY_ID&owner_id=eq.$OWNER_ID' '{
  "status": "corrected",
  "corrected_text": "I went to university yesterday and studied English for one hour.",
  "explanation": "goes は過去なので went、study は studied です。",
  "corrected_by": "writer"
}'
```

curl の場合:

```bash
curl -s -X PATCH "$SUPABASE_URL/rest/v1/eng_essays?id=eq.ESSAY_ID&owner_id=eq.$OWNER_ID" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "status": "corrected",
    "corrected_text": "I went to university yesterday and studied English for one hour.",
    "explanation": "goes は過去なので went、study は studied です。",
    "corrected_by": "writer"
  }'
```

画面では、原文と添削を左右（狭い画面では上下）に並べ、削除と追加の差分も出します。

### リサーチャー

仕事は、教材になりそうな記事や音声の URL を記録することです。

| 列 | 内容 |
| --- | --- |
| url | `http://` または `https://` で始まる。1〜2000文字 |
| title | 1〜300文字 |
| kind | `article`（記事）、`video`（動画）、`other`（その他） |
| note | メモ。無くてよい。2000文字まで |
| recorded_on | `YYYY-MM-DD`。省略すると東京の今日 |
| added_by | 記録した人。リサーチャーは `researcher` |
| created_by | 同じ役割。リサーチャーは `researcher` |

```bash
scripts/eng.sh POST eng_resources '{
  "owner_id": "$OWNER_ID",
  "url": "https://www.bbc.co.uk/learningenglish/english/features/the-english-we-speak",
  "title": "BBC The English We Speak",
  "kind": "article",
  "note": "短い会話表現。読むか、音声があればシャドーイングに使います。",
  "recorded_on": "2026-11-01",
  "added_by": "researcher",
  "created_by": "researcher"
}'
```

curl の場合:

```bash
curl -s "$SUPABASE_URL/rest/v1/eng_resources" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "owner_id": "'"$OWNER_ID"'",
    "url": "https://www.youtube.com/@bbclearningenglish",
    "title": "BBC Learning English",
    "kind": "video",
    "note": "6 Minute English をリスニングに使う。",
    "added_by": "researcher",
    "created_by": "researcher"
  }'
```

今日分の短縮は `GET /rest/v1/eng_today_resources?owner_id=eq.$OWNER_ID` です。

`https://` で始まらない URL は、制約 `eng_resources_url` で断られます。

### 便利なビュー

どれも元の表の RLS を継承します。service_role なら絞りがないと全所有者分が見えるので、`owner_id=eq.$OWNER_ID` を付けてください。

| ビュー | 中身 |
| --- | --- |
| `eng_open_questions` | `status=open` |
| `eng_pending_essays` | `status=pending` |
| `eng_unsubmitted_assignments` | `status=assigned`（未提出） |
| `eng_submitted_assignments` | `status=submitted`（フィードバック待ち） |
| `eng_today_expressions` | 東京の今日の表現 |
| `eng_today_resources` | 東京の今日の教材 |

### 削除

本人の画面からも消せます。ボットが消すときは、`owner_id` を必ず付けます。

```bash
scripts/eng.sh DELETE 'eng_resources?id=eq.RESOURCE_ID&owner_id=eq.$OWNER_ID'
```

## 困ったとき

- 「英語学習の表がまだありません」: 上の SQL がまだです。`english_schema.sql` を SQL Editor で一度実行する。`config.js` は空に戻さない。
- ボットが入れた行が画面に出ない: `owner_id` が、ログイン中のユーザーと違う。`select id, email from auth.users;` の id を使う。
- 添削や回答やフィードバックが 400 になる: 状態と、本文と、誰が書いたかを **1回の PATCH** で一緒に送る。未添削のまま添削文だけ入れることはできない。
- URL が保存できない: `https://` か `http://` で始める。
- ログインできない: 予定アプリと同じユーザーです。Auto Confirm がオフだと失敗します。
- ページが古い: 一度閉じて開き直す。`config.js` は予定アプリと共通で、ネットワーク優先です。
