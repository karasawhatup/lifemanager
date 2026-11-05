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
| ホーム | 今日の学習、未対応の件数（未回答の質問、添削待ちの作文、フィードバック待ち）、未提出の課題。会話と発音への入口 |
| 会話 | AI と声で英語を話す。場面とレベルを選び、文字起こしとフィードバックを残す |
| 発音 | 文の読み上げか、台本なしの自由発話を採点する。点数の推移と、よくずれる音 |
| 表現 | 使った単語や表現。表現、意味、例文、タグ、日付 |
| 教材 | 学習に使った記事・動画・その他の URL。タイトル、種類、メモ、日付、誰が追加したか |
| 質問 | 文法や表現の質問。状態は `open`（未回答）か `answered`（回答済み）。答えはあとから入る |
| 作文 | 英文を提出する。添削が来ると、原文と添削を並べ、単語の差分と日本語の説明を出す |
| 課題 | タイトル、指示、期限。状態は `assigned`（未提出）→ `submitted`（提出済み）→ `reviewed`（フィードバック済み）。答えはこの画面で出す |

入力欄は、iPhone で拡大しない文字サイズです。画面上下の安全領域（ノッチ、ホームバー）にも余白があります。

ホーム画面に置くとき: Safari で上の URL を開き、共有 → **ホーム画面に追加**。名前は「英語学習」です。

## デモモード

`public/config.js` の URL と鍵が空なら、デモモードです。サンプルの表現、教材、質問、作文、課題、会話、発音が、そのブラウザの中だけに保存されます。サーバーには送られません。右上のメニューの **サンプルに戻す** で最初の状態に戻せます。予定アプリの「サンプルに戻す」とは別です。

デモモードの会話と発音は見本です。マイクも、Gemini も、Azure も使いません。画面にはその旨が出ます。鍵を入れたあとの結果の見た目を確認するためのものです。

## スピーキングを有効にする

会話の返事は [Gemini API](https://ai.google.dev/gemini-api/docs/pricing) の無料枠です。声の認識と読み上げは、ブラウザの Web Speech API で、追加料金はありません。発音の採点だけ [Azure AI Speech](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-pronunciation-assessment) を使います。Azure の無料枠（F0）には月の上限があり、超えると有料になります。会話は画面の上限（初期値 10 分。5 / 10 / 15 / 20 分から選べます）で自動的に切れ、経過時間を表示します。

API キーはブラウザにも `config.js` にもリポジトリにも置きません。Supabase の Edge Function だけが鍵を持ち、ログイン済みのユーザーに返事だけを返します。

API キーはブラウザにも `config.js` にもリポジトリにも置きません。Supabase の Edge Function だけが鍵を持ち、ログイン済みのユーザーに、短いトークンだけを返します。

一度だけ、次をやります。CLI は入れなくてよいです。

### 1. SQL を実行する

1. [Supabase](https://supabase.com) で、いま LIFEMANAGER に使っているプロジェクトを開く。
2. **SQL Editor** → **New query**。
3. [`supabase/english_speaking_schema.sql`](../supabase/english_speaking_schema.sql) を開き、中身を**全部**貼り付けて **Run**。
4. **Table Editor** に次の2つが増える。
   - `eng_speaking_sessions` 会話
   - `eng_pronunciation_attempts` 発音
5. 最後に publication が無いという notice が出たときだけ、**Database → Publications** でこの2つの表を有効にする。

この SQL は、予定の表も、すでにある `eng_expressions` などの表も、中のデータも変更しません。もう一度 Run しても、入っている記録は消えません。

### 2. Gemini の API キー（無料）

1. [Google AI Studio の API キー](https://aistudio.google.com/apikey) を開く。Google アカウントで入る。
2. **Create API key**。支払い方法は要りません。無料枠のまま使います。
3. 表示された鍵を控える。これが `GEMINI_API_KEY`。リポジトリには貼らない。
4. 無料枠には、1分あたりと1日あたりの回数の上限があります。超えると画面に「無料枠の回数に達しました。1分ほど待ってからもう一度話してください」と出ます。待ってからもう一度押します。
5. 無料枠で送った文章は、Google が製品の改善に使うことがあります。話した英文と、画面が送る会話の履歴がこれに含まれます。有料プランにすると、改善への利用は止まりますが、このアプリは無料枠のままです。

アプリが使うモデルは `gemini-3.8-flash` です。Edge Function が `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent` を呼びます。ブラウザは鍵を持たず、返事の英文だけを受け取ります。声はブラウザの音声認識（`en-US`）と読み上げです。Firefox のように音声認識が無いブラウザでは、英語を打って送れます。

### 3. Azure Speech のキー（無料の F0）

1. [Azure Portal](https://portal.azure.com) を開く。アカウントが無ければ無料で作れます。
2. **リソースの作成** → **Speech**（または AI services の Speech）を検索する。
3. 次で作成する。
   - サブスクリプション: 自分のもの
   - リソースグループ: 新規で `lifemanager` など
   - リージョン: **Japan East** があればそれ。無料の F0 が Japan East に無いときは **East US**
   - 名前: `lifemanager-speech`
   - 価格レベル: **Free F0**。月に数時間までの上限があります。超えると使えなくなるか、有料の S0 に変えないと続きません
4. 作成が終わったら、そのリソースの **キーとエンドポイント** を開く。
   - **キー 1** を控える。これが `AZURE_SPEECH_KEY`。
   - リージョン名を控える。Japan East なら `japaneast`、East US なら `eastus`。画面の場所名ではなく、この短い英字です。これが `AZURE_SPEECH_REGION`。
5. キーはリポジトリに貼らない。

発音はブラウザの Speech SDK が、約10分で失効するトークンで `en-US` を採点します。関数は `POST https://<region>.api.cognitive.microsoft.com/sts/v1.0/issueToken` を呼び、キー自体は返しません。

### 4. Supabase のアクセストークンとプロジェクト ID

1. [Supabase のアクセストークン](https://supabase.com/dashboard/account/tokens) を開く。
2. **Generate new token**。名前は `lifemanager-github` などでよい。出たトークンを控える。これが `SUPABASE_ACCESS_TOKEN`。アカウントに紐づく強い権限なので、GitHub の秘密以外には置かない。
3. プロジェクトの **Project Settings → General** を開く。**Reference ID** をコピーする。英小文字と数字で20文字です。`public/config.js` の URL `https://この部分.supabase.co` のホスト名と同じです。これが `SUPABASE_PROJECT_REF`。

`service_role` キーは、この作業では使いません。GitHub の秘密にも入れません。

### 5. GitHub の Actions 秘密に入れる

リポジトリの **Settings → Secrets and variables → Actions → New repository secret**。名前は一字一句このとおりです。

| 名前 | 中身 |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | 手順4のアクセストークン |
| `SUPABASE_PROJECT_REF` | 手順4の Reference ID |
| `GEMINI_API_KEY` | 手順2の Gemini の鍵 |
| `AZURE_SPEECH_KEY` | 手順3のキー 1 |
| `AZURE_SPEECH_REGION` | `japaneast` や `eastus` |

値はリポジトリのファイルには書きません。

### 6. 関数をデプロイする

1. この変更が `main` に入っていること。入っていないと、ワークフローのファイルがまだありません。
2. GitHub の **Actions** → **Deploy speaking functions** → **Run workflow** → `main` を選んで実行。
3. 緑になれば、`conversation-reply` と `speech-token` がデプロイされ、Gemini と Azure の秘密が Supabase の関数秘密に入っています。以前の `OPENAI_API_KEY` はもう使いません。GitHub の Actions 秘密にあれば消してかまいません。ログに鍵の値は出しません。
4. 秘密が空のまま実行すると、デプロイはせずに終わります。秘密を入れてから、もう一度 **Run workflow** します。
5. 関数のファイルを `main` に push したときも、秘密が揃っていれば同じワークフローが動きます。

ワークフローは [`.github/workflows/speaking-functions.yml`](../.github/workflows/speaking-functions.yml) です。Supabase CLI は GitHub Actions の中だけで動きます。ホストのプロジェクトを変えるコマンドは、Actions では確認の質問に答えられないので、ワークフローが `--yes` を付けて進めます。秘密の値はログに出しません。

### 7. 画面で試す

1. GitHub Pages の Deploy が終わった `https://karasawhatup.github.io/lifemanager/english/` を開く。
2. 予定アプリと同じメールアドレスとパスワードでログインする。
3. **会話** で場面とレベル、声と速さを選び、**会話を始める**。**話す** を押して英語を話すと、少し黙ったところで止まり、Gemini が返事をします。音声認識が無いブラウザでは、下の欄に英語を打って **送る**。iPhone は Safari で開き、AI の声が鳴らないときは **聞く** を押します。終了すると、文字起こしとフィードバックが残り、表現は **表現メモに追加** で今の表現リストに入ります。話した直後の **この発話を採点** は、その録音を Azure に渡します。録音が残っていない文は、発音の画面でもう一度読みます。
4. **発音** で文を選び、**録音して採点**。点数、色のついた単語と音素、日本語のヒント、折れ線、よくずれる音が出ます。

iPhone は Safari で開きます。ホーム画面に追加したあとも、最初にマイクを許可します。LINE などのアプリ内ブラウザでは、マイクが使えないことが多いです。サイレントスイッチがオンだと、AI の声が聞こえないことがあります。

## 会話と発音の画面

スマホは下のナビゲーション（項目が多いので横にずれます）、横幅 600px 以上は左のレールです。会話と発音に、右下の ＋ はありません。

| 場面 | 値 |
| --- | --- |
| フリートーク | `free_talk` |
| 日常生活 | `daily_life` |
| 大学生活 | `campus_life` |
| 旅行 | `travel` |
| 就職面接 | `job_interview` |
| 自分で決める | `custom`（話題が必須） |

レベルは `a2`（初級）、`b1`（中級）、`b2`（上級）です。

会話の `transcript` は `{role, text, at}` の配列です。`role` は `user` か `assistant`。`feedback` は次の形です。

```json
{
  "good_points": ["日本語"],
  "mistakes": [{ "original": "学習者の英文", "correction": "自然な英文", "note": "短い日本語" }],
  "expressions": [{ "term": "表現", "meaning": "意味", "example": "例文" }]
}
```

発音の `mode` は `read_aloud`（台本あり）か `unscripted`（台本なし）です。`words` は `{word, accuracy, error_type, phonemes:[{phoneme, accuracy}]}` です。`error_type` には `None`、`Mispronunciation`、`Omission`、`Insertion` などが出ます。点数は 0 から 100 です。`source` が `conversation` の行は、会話で話した録音を採点したか、その文をもう一度読んだ記録です。ブラウザが録音を残せなかったときは、もう一度読む方式です。

読み上げ用の文は、L/R、TH、V/B、F/H、母音、強勢、リンキングを含みます。自由発話は参照文なしで、Azure が聞き取った内容を採点します。完全さは出ないことがあります。音素の詳細は `en-US` です。

## 困ったとき（スピーキング）

- 会話も発音も見本しか出ない: デモモードか、関数がまだ無いか、鍵が違う。上の手順 5 と 6 を確認する。`config.js` は空に戻さない。anon key 以外は書かない。
- 「表がまだありません」: 手順 1 の SQL がまだ。既存の英語の画面は、この SQL の前でも使える。
- マイクが使えない: サイトの許可、Safari、サイレントスイッチ。`http://` の素の IP ではマイクは使えません。GitHub Pages は https です。
- 「無料枠の回数に達しました」: Gemini の無料枠です。1分ほど待ってからもう一度話します。支払い方法は要りません。
- 発音のトークンのエラー: Azure のキーとリージョン名（`japaneast` のように英字だけ）。関数のログは Supabase の **Edge Functions → Logs**。
- 声で話せない: Firefox など、音声認識が無いブラウザです。英語を打って送ります。iPhone は Safari で開きます。
- 10分で切れる: 画面の上限です。20分より長くは選べません。

会話の記録が画面に出ないときは、他の表と同じで `owner_id` がログイン中のユーザーと違います。

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

5つの表に加えて、会話と発音も読めます。質問・課題・表現・URL・作文のどれにも書けます。朝は次を見ると、未対応と、直近の話し方・発音が分かります。レッスンは、会話の `feedback.mistakes` と、発音で繰り返し低い音素から組んでください。

```bash
scripts/eng.sh GET 'eng_open_questions?owner_id=eq.$OWNER_ID&order=created_at.asc'
scripts/eng.sh GET 'eng_pending_essays?owner_id=eq.$OWNER_ID&order=created_at.asc'
scripts/eng.sh GET 'eng_unsubmitted_assignments?owner_id=eq.$OWNER_ID&order=due_on.asc'
scripts/eng.sh GET 'eng_submitted_assignments?owner_id=eq.$OWNER_ID&order=submitted_at.asc'
scripts/eng.sh GET 'eng_today_expressions?owner_id=eq.$OWNER_ID&order=created_at.desc'
scripts/eng.sh GET 'eng_today_resources?owner_id=eq.$OWNER_ID&order=created_at.desc'
scripts/eng.sh GET 'eng_today_speaking?owner_id=eq.$OWNER_ID&order=started_at.desc'
scripts/eng.sh GET 'eng_recent_speaking?owner_id=eq.$OWNER_ID&order=started_at.desc&limit=20'
scripts/eng.sh GET 'eng_today_pronunciation?owner_id=eq.$OWNER_ID&order=created_at.desc'
scripts/eng.sh GET 'eng_recent_pronunciation?owner_id=eq.$OWNER_ID&order=recorded_on.desc&limit=50'
```

会話の本文とフィードバックは `eng_speaking_sessions` の `transcript` と `feedback` です。発音の単語と音素は `eng_pronunciation_attempts` の `words` です。どちらもアプリが `created_by=app` で書きます。チューターは読んで、質問・課題・表現に反映します。この2つの表へボットが直接書く必要はありません。

```bash
scripts/eng.sh GET 'eng_speaking_sessions?owner_id=eq.$OWNER_ID&order=started_at.desc&limit=10'
scripts/eng.sh GET 'eng_pronunciation_attempts?owner_id=eq.$OWNER_ID&order=created_at.desc&limit=30'
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
| `eng_today_speaking` | 東京の今日の会話 |
| `eng_recent_speaking` | 過去14日の会話 |
| `eng_today_pronunciation` | 東京の今日の発音 |
| `eng_recent_pronunciation` | 過去30日の発音 |

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
- 会話や発音が見本のまま: 「スピーキングを有効にする」の SQL と、GitHub Actions の **Deploy speaking functions** がまだです。API キーは GitHub の Actions 秘密にだけ入れ、`config.js` には書きません。
