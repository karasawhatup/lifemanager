# LIFEMANAGER

XOLDA の1日を、10分単位で見るためのアプリです。起きた時刻と寝た時刻、予定ができたかどうか、移動にかかる時間、小さなやりたいこと、Todo、その場の変更要望を残します。

データは [Supabase](https://supabase.com) に置きます。スマホのアプリと、予定を組むボット（AI）が、同じ表を読み書きします。Supabase をつなぐ前でも、サンプル入りのデモモードで画面を触できます。

時刻の基準は **Asia/Tokyo** です。表示も保存の日付も、日本時間です。

## 最初にやること

1. このプルリクエストを `main` にマージする。マージされると GitHub Actions がページを公開します。
2. GitHub のリポジトリで **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする。Actions が止まっている場合は **Settings → Actions → General** で Actions を許可する。
3. 公開された `https://karasawhatup.github.io/lifemanager/` を iPhone の Safari で開く。まだ Supabase がなくてもデモの予定が見えます。共有ボタン → **ホーム画面に追加**。
4. 下の「Supabase を作る」をやる。
5. `public/config.js` に Project URL と **anon key** だけを書いて、`main` にコミットする。
6. Actions の Deploy が終わるのを待って、アプリの **設定** からログインする。
7. ボットを動かすときだけ、`service_role` キーと自分のユーザー ID をボットの秘密として渡す。GitHub やこのアプリには置かない。

## 画面

左上のメニューから移動します。日付は左右の矢印か、画面の横スワイプで変わります。

| 画面 | 何をするか |
| --- | --- |
| 今日の予定 | 10分ごとの1日。予定をタップして「できた / 見送った / まだ」。空いている行をタップして、その時刻に起床・就寝、または予定を追加。下の「いま起床」「いま就寝」は、今の10分区切りに記録する |
| 修正の要望 | いまの予定を変えたいことを文章で送る。ボットが返事を書くと、ここに出る |
| 小さなやりたいこと | 行きたい店、一人カラオケ、ゲームなど。全部を毎日の予定に入れるものではない |
| Todo | 緊急な順に A / B / C。期限と分数は任意。分数は10分単位 |
| 移動時間 | 場所から場所へ何分かかるか。家→大学は20分、サークルは30分が最初の目安 |
| 設定 | ログインと、ボットが読む数字（余白、準備、英語、食事、風呂、洗濯、1日の長さ） |

「いま 00:28」のような時刻をタップすると、タイムラインの現在時刻の線まで動きます。線は選んでいる日が今日のときだけ出ます。

## デモモード

`public/config.js` の URL と鍵が空なら、デモモードです。サンプルの1日（授業、移動、英語、サークル、余白、風呂など）が、そのブラウザの中だけに保存されます。サーバーには送られません。設定の「サンプルに戻す」で最初の状態に戻せます。

## Supabase を作る

ブラウザだけでできます。

1. [https://supabase.com](https://supabase.com) を開き、アカウントを作る（GitHub で入ってよい）。
2. **New project**。
   - Name: `lifemanager`
   - Database password: 自分で決めて、パスワード管理の場所に控える。アプリには入れない。
   - Region: **Northeast Asia (Tokyo)** があればそれ。なければ近い地域。
   - 料金は無料の枠でよい。
3. プロジェクトが開くまで待つ。
4. 左の **SQL Editor** → **New query**。
5. このリポジトリの [`supabase/schema.sql`](supabase/schema.sql) を開き、中身を**全部**貼り付けて **Run**。
6. 成功すれば、**Table Editor** に次の表がある。
   - `schedule_blocks` 予定
   - `todos` Todo
   - `wishes` やりたいこと
   - `wake_sleep_logs` 起床・就寝
   - `change_requests` 修正の要望
   - `travel_times` 移動時間
   - `settings` 設定
7. 歯車の **Project Settings → API**（または API Keys）を開く。
   - **Project URL**（`https://xxxx.supabase.co`）をコピーする。
   - 公開してよい鍵をコピーする。名前は `anon` `public`。長い文字列で、`eyJ` で始まることが多い。新しい画面では `publishable` と書いてあることもある。
   - `service_role` や `secret` と書いてある鍵は、ここではコピーしない。
8. **Authentication → Users → Add user → Create new user**。
   - 自分のメールアドレスとパスワード。
   - **Auto Confirm User** をオン。これを忘れるとログインできない。
   - ユーザーはこの1人だけにする。
9. メールの設定に「新規ユーザーの登録を許可」があればオフにする。知らない人が自分でアカウントを作れないようにする。
10. **Authentication → URL Configuration**。
    - Site URL: `https://karasawhatup.github.io/lifemanager/`
    - Redirect URLs にも同じ URL を追加する。
    - メールのリンクでログインするときに必要。パスワードで入るだけなら、あとからでもよい。
11. SQL Editor で次を実行し、出た `id` を控える。これがボット用の `OWNER_ID`。

```sql
select id, email from auth.users;
```

無料枠のプロジェクトは、しばらく使わないと休止します。開けなくなったらダッシュボードで **Resume** を押すと戻ります。データは消えません。

### Realtime

`schema.sql` の最後で、ボットが予定を書き換えたときアプリが自動で追随するよう、各表を Realtime に載せています。SQL の最後に publication が無いという notice が出たときだけ、**Database → Publications** で上の7つの表を有効にしてください。

## config.js を入れる

GitHub の `public/config.js` を編集します（ウェブの鉛筆ボタンでよい）。

```js
window.LIFEMANAGER_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "eyJ....anon の鍵....",
};
```

`main` にコミットすると、Actions がもう一度ページを公開します。反映後、アプリの **設定** から手順8のメールとパスワードでログインします。

このリポジトリは公開されています。anon key がファイルに入っても、予定そのものは公開されません。読むには、あなたのログインか、ボット用の service_role が必要です（表には Row Level Security がかかっています）。

**service_role / secret は、config.js にも GitHub にもチャットにも置かない。** それが漏れると、ログインなしで全データに触れます。

開発者向けに、ビルド時の環境変数 `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` でも同じ値を渡せます。`config.js` に値があるときは、そちらが優先です。

## GitHub Pages

ワークフローは [`.github/workflows/pages.yml`](.github/workflows/pages.yml) です。`main` への push と、手動実行（workflow_dispatch）で動きます。

1. **Settings → Pages → Source** を **GitHub Actions** にする。
2. **Actions** タブで「Deploy GitHub Pages」が緑になるのを確認する。
3. 公開 URL は `https://karasawhatup.github.io/lifemanager/`。

別のワークフロー [`.github/workflows/ci.yml`](.github/workflows/ci.yml) は、プルリクエストの時点でビルドできるかを確認します。

ページは静的ファイルです。予定のデータは Supabase にあり、ページの中には入りません。

## iPhone に置く

1. Safari で公開 URL を開く。
2. 共有ボタン → **ホーム画面に追加**。
3. ホーム画面の LIFEMANAGER から開くと、全画面になります。

入力欄は拡大しないサイズにしてあります。画面上部と下部の安全領域（ノッチ、ホームバー）にも余白を取っています。

## ボットが予定を組むときのルール

アプリは予定を「組む」場所ではなく、記録する場所です。組むのはボットです。数字の初期値は設定テーブルに入っています。

- 予定は10分単位。日付は東京のカレンダー日。UTC の日付を使わない（朝9時前の日本は、UTC では前日）。
- 起床の記録が付いたら、そこから `day_length_hours`（初期値 16）時間ぶんを基本にする。就寝の記録が付いたら、その日はそこで止める。
- 同じ日の `wake` が複数あるときは、**今以前で一番遅いもの**を起床とする。
- 家を出る前の準備は `prep_minutes`（初期値 40）。カテゴリは `prep`。余白には数えない。
- 移動は `travel_times` の分数。初期の目安は家↔早稲田大学が20分、サークルが30分。カテゴリは `travel`。余白には数えない。
- カテゴリ `buffer` を、移動と準備を除いて1日 `buffer_minutes_per_day`（初期値 120）以上入れる。忙しい日は多めでもよい。
- 英語は1日 `english_minutes_per_day`（初期値 60）。忙しすぎる日と、修正要望で外す日は除く。
- 食事は `meal_minutes`（初期値 40）。朝ごはんはなくてよい。食事と食事の間は4時間以上。
- 風呂は毎日 `bath_minutes`（初期値 30）。乾かす時間を含む。
- 洗濯は `laundry_interval_days`（初期値 3）日に一度。
- Todo は A、次に B、次に C。`estimated_minutes` を予定の長さの目安にする。
- Moodle の課題はカテゴリ `moodle`。
- `wishes` は小さなやりたいこと。毎日全部は入れない。
- `change_requests` の `open` を読み、予定を直したあと `bot_response` に文章を書き、`status` を `handled` にする。
- その日のボットの予定を差し替えるときは、`source=bot` のブロックだけ消してから入れ直す。`source=app`（自分で入れた予定）は残す。
- 時刻が重ならないように置く。アプリは重なりを禁止しないが、画面には警告を出す。

## ボット向け API

ベース URL は `$SUPABASE_URL/rest/v1/<テーブル名>` です。ボットは **service_role** を使います。この鍵は RLS を通り抜けるので、毎回 `owner_id` を自分で入れてください。入れ忘れると、アプリから見えません。

アプリからの保存は `source` と `created_by` が `app` です。ボットは両方 `bot` にしてください。`created_at` と `updated_at` は自動です。送らなくてよいです。

```bash
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="service_role の鍵。公開しない"
export OWNER_ID="auth.users の uuid"
```

以降の例は、すべて次の2つのヘッダーを付けます。

```text
apikey: $SUPABASE_SERVICE_ROLE_KEY
Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY
```

書き込みにはさらに `Content-Type: application/json` と、結果を受け取る `Prefer: return=representation` を付けます。

### schedule_blocks（予定）

| 列 | 内容 |
| --- | --- |
| id | uuid。自動 |
| owner_id | 必須（ボット）。アプリは自動 |
| date | `YYYY-MM-DD`。東京の日付 |
| start_time | `HH:MM:SS`。10分単位。`24:00:00` は不可 |
| end_time | `HH:MM:SS`。10分単位。終わりだけ `24:00:00` 可。開始より後 |
| title | 1〜500文字 |
| category | `prep` `class` `club` `travel` `meal` `bath` `laundry` `english` `moodle` `todo` `wish` `free` `buffer` |
| status | `planned` `done` `skipped`。初期値 `planned` |
| notes | 任意 |
| source | `app` または `bot` |
| created_by | 任意の文字。ボットは `bot` |
| created_at / updated_at | 自動 |

予定を1件入れる:

```bash
curl -s "$SUPABASE_URL/rest/v1/schedule_blocks" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "owner_id": "'"$OWNER_ID"'",
    "date": "2026-10-28",
    "start_time": "09:00:00",
    "end_time": "10:30:00",
    "title": "授業",
    "category": "class",
    "status": "planned",
    "notes": "1限",
    "source": "bot",
    "created_by": "bot"
  }'
```

複数件は、`{...}` の代わりに `[{...},{...}]` を送ります。

その日の予定を読む:

```bash
curl -s "$SUPABASE_URL/rest/v1/schedule_blocks?owner_id=eq.$OWNER_ID&date=eq.2026-10-28&order=start_time.asc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

状態を変える（`id` は挿入の返事に入っている uuid）:

```bash
curl -s -X PATCH "$SUPABASE_URL/rest/v1/schedule_blocks?id=eq.BLOCK_ID" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"status":"done"}'
```

その日のボット予定だけ消して入れ直す:

```bash
curl -s -X DELETE "$SUPABASE_URL/rest/v1/schedule_blocks?owner_id=eq.$OWNER_ID&date=eq.2026-10-28&source=eq.bot" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Prefer: return=representation"
```

`source=eq.app` は付けないでください。自分で入れた予定まで消えます。

今日の予定だけ取る短縮:

```bash
curl -s "$SUPABASE_URL/rest/v1/today_blocks?order=start_time.asc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

10分になっていない時刻は、400 と制約名 `schedule_blocks_ten_min` で断られます。終了が開始以前なら `schedule_blocks_order` です。

### todos

| 列 | 内容 |
| --- | --- |
| id / owner_id | 予定と同じ |
| title | 1〜500文字 |
| rank | `A` `B` `C`。A が最も緊急 |
| due_date | `YYYY-MM-DD` か null |
| estimated_minutes | null、または 10〜600 の10の倍数 |
| status | `open` `done` |
| notes / source / created_by / created_at / updated_at | 予定と同じ考え方 |

未完了の A を読む:

```bash
curl -s "$SUPABASE_URL/rest/v1/todos?owner_id=eq.$OWNER_ID&rank=eq.A&status=eq.open&select=*" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

追加する:

```bash
curl -s "$SUPABASE_URL/rest/v1/todos" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "owner_id": "'"$OWNER_ID"'",
    "title": "Moodleの小レポートを出す",
    "rank": "A",
    "due_date": "2026-10-29",
    "estimated_minutes": 90,
    "status": "open",
    "source": "bot",
    "created_by": "bot"
  }'
```

完了にする:

```bash
curl -s -X PATCH "$SUPABASE_URL/rest/v1/todos?id=eq.TODO_ID" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"status":"done"}'
```

未完了だけ: `GET /rest/v1/open_todos?order=rank.asc`

### wishes（小さなやりたいこと）

| 列 | 内容 |
| --- | --- |
| title | 1〜500文字 |
| category | `restaurant` `karaoke` `game` `shopping` `outing` `other` |
| notes | 任意 |
| done | `true` / `false` |
| その他 | owner_id, source, created_by, created_at, updated_at |

まだのものを読む:

```bash
curl -s "$SUPABASE_URL/rest/v1/wishes?owner_id=eq.$OWNER_ID&done=eq.false&select=*" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

追加する:

```bash
curl -s "$SUPABASE_URL/rest/v1/wishes" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "owner_id": "'"$OWNER_ID"'",
    "title": "一人カラオケ",
    "category": "karaoke",
    "done": false,
    "source": "bot",
    "created_by": "bot"
  }'
```

### wake_sleep_logs（起床・就寝）

| 列 | 内容 |
| --- | --- |
| type | `wake` または `sleep` |
| logged_at | タイムゾーン付きの時刻。例 `2026-10-28T07:10:00+09:00` |
| notes | 任意 |
| その他 | owner_id, source, created_by, created_at, updated_at |

直近を読む:

```bash
curl -s "$SUPABASE_URL/rest/v1/wake_sleep_logs?owner_id=eq.$OWNER_ID&select=id,type,logged_at,notes&order=logged_at.desc&limit=20" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

今日だけ: `GET /rest/v1/today_wake_sleep?order=logged_at.asc`

ある日だけ（URL では `+` を `%2B` にする）:

```bash
curl -s "$SUPABASE_URL/rest/v1/wake_sleep_logs?owner_id=eq.$OWNER_ID&logged_at=gte.2026-10-28T00:00:00%2B09:00&logged_at=lt.2026-10-29T00:00:00%2B09:00&order=logged_at.asc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

ボットが記録を足すとき:

```bash
curl -s "$SUPABASE_URL/rest/v1/wake_sleep_logs" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "owner_id": "'"$OWNER_ID"'",
    "type": "wake",
    "logged_at": "2026-10-28T07:10:00+09:00",
    "source": "bot",
    "created_by": "bot"
  }'
```

消さずに足していきます。同じ日に何件あっても、今以前で一番遅い `wake` を起床、一番遅い `sleep` を就寝として扱ってください。

### change_requests（修正の要望）

| 列 | 内容 |
| --- | --- |
| body | 本人が書いた文章。1〜4000文字 |
| status | `open` または `handled` |
| bot_response | ボットの返事。未対応のあいだは null |
| その他 | owner_id, source, created_by, created_at, updated_at |

未対応を読む:

```bash
curl -s "$SUPABASE_URL/rest/v1/change_requests?owner_id=eq.$OWNER_ID&status=eq.open&order=created_at.asc" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

短縮: `GET /rest/v1/open_change_requests?order=created_at.asc`

対応済みにする:

```bash
curl -s -X PATCH "$SUPABASE_URL/rest/v1/change_requests?id=eq.REQUEST_ID" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"status":"handled","bot_response":"英語を21:10に移し、昼に余白を入れました。"}'
```

### travel_times（移動）

| 列 | 内容 |
| --- | --- |
| from_place | 出発。1〜80文字 |
| to_place | 到着。出発と同じは不可 |
| minutes | 1〜1440。10分単位でなくてよい |
| notes | 任意 |
| その他 | owner_id, source, created_by, created_at, updated_at |

`(owner_id, from_place, to_place)` は1組だけです。同じ区間は upsert できます。

```bash
curl -s "$SUPABASE_URL/rest/v1/travel_times?owner_id=eq.$OWNER_ID&select=*" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/travel_times?on_conflict=owner_id,from_place,to_place" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=representation" \
  -d '{
    "owner_id": "'"$OWNER_ID"'",
    "from_place": "家",
    "to_place": "早稲田大学",
    "minutes": 20,
    "source": "bot",
    "created_by": "bot"
  }'
```

### settings

1人につき1行です。主キーは `owner_id`。

| 列 | 初期値 | 意味 |
| --- | --- | --- |
| display_name | XOLDA | 画面の名前 |
| timezone | Asia/Tokyo | 固定で使ってよい |
| buffer_minutes_per_day | 120 | 余白の最低分数。移動と準備は含めない |
| prep_minutes | 40 | 家を出る前の準備 |
| english_minutes_per_day | 60 | 英語 |
| meal_minutes | 40 | 食事1回 |
| bath_minutes | 30 | 風呂 |
| laundry_interval_days | 3 | 洗濯の間隔 |
| day_length_hours | 16 | 起床から予定を組む長さ |

```bash
curl -s "$SUPABASE_URL/rest/v1/settings?owner_id=eq.$OWNER_ID&select=*" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

行が無いときは、アプリに一度ログインすると初期値で作られます。

### 便利なビュー

どれも元の表の RLS を継承します。service_role なら全所有者分が見えるので、運用が1人でも `owner_id` で絞ると安全です。

| ビュー | 中身 |
| --- | --- |
| `today_blocks` | 東京の今日の予定 |
| `today_wake_sleep` | 東京の今日の起床・就寝 |
| `open_change_requests` | `status=open` |
| `open_todos` | `status=open` |

## ローカルで動かす

Node.js 20 以降。

```bash
npm install
npm run dev
```

ブラウザで `http://127.0.0.1:5173` を開きます。鍵が空ならデモです。

```bash
npm run build
npm run preview
```

`dist/` が GitHub Pages に載る中身です。

## 困ったとき

- ログインできない: ユーザー作成時の Auto Confirm がオフだと失敗します。Authentication → Users でそのユーザーを確認済みにするか、作り直します。
- 「メールが未確認」と出る: 同上です。
- 予定が空のまま: `config.js` の URL と anon key が公開後のページに入っているか、ログインしているかを見ます。ボットが入れた行の `owner_id` が、ログイン中のユーザーと違うとアプリには出ません。
- 10分以外の時刻で保存できない: 仕様です。`09:05` は `09:00` か `09:10` にします。
- ページが古い: ホーム画面のアプリを一度閉じて開き直します。`config.js` はネットワーク優先で取りにいきます。
- プロジェクトが開けない: Supabase の無料枠が休止しています。ダッシュボードで Resume。
