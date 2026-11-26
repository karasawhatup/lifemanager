# 外部の AI からつなぐ

Claude、ChatGPT、Cursor、そのほか MCP に対応した AI から、LIFEMANAGER の予定と英語学習の記録を読み書きします。サーバーは1つです。会話の生成と発音の採点はしません。保存してある会話と発音だけ読めます。

時刻の基準は **Asia/Tokyo** です。

接続先:

```text
https://oynfsgxgpsotvbqbpksl.supabase.co/functions/v1/mcp
```

AI に渡す秘密は、設定画面で作る個人トークンだけです。Supabase の `service_role` キーは、AI にも GitHub にも置きません。関数の中だけで使います。

## マージしたあとにやること

1. この変更を `main` にマージする。ページの公開（GitHub Pages）はそのまま動きます。MCP の公開は別のワークフローです。
2. [Supabase](https://supabase.com) で、いま使っているプロジェクトを開く。
3. **SQL Editor** → **New query**。
4. [`supabase/mcp_tokens.sql`](../supabase/mcp_tokens.sql) を開き、中身を**全部**貼り付けて **Run**。
5. もう一度 Run しても、作ったトークンは消えません。予定や英語の表も変わりません。
6. GitHub のリポジトリで **Settings → Secrets and variables → Actions → New repository secret**。

| 名前 | 中身 | 必須 |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | [アクセストークン](https://supabase.com/dashboard/account/tokens) で作ったもの | 必須 |
| `SUPABASE_PROJECT_REF` | Project Settings → General の Reference ID。`oynfsgxgpsotvbqbpksl` | 空ならこの ID を使います |

スピーキング用に同じ秘密がすでにあるなら、作り直さなくてよいです。`service_role` は入れません。

7. **Actions** → **Deploy MCP function** → **Run workflow** → `main`。緑ならデプロイできています。秘密が空だと、デプロイせずに終わります。秘密を入れてから、もう一度実行します。`main` に関数の変更が入ったときも、秘密があれば同じワークフローが動きます。
8. ブラウザで次を開く。日本語の説明が出れば、関数は届いています。

```text
https://oynfsgxgpsotvbqbpksl.supabase.co/functions/v1/mcp
```

9. アプリの **設定** にログインする。**トークンを作る**。名前（例: Claude）と、権限（読むだけ / 読み書き）を選ぶ。
10. 出た `lm_` で始まる文字列を、その AI の設定に貼る。この画面を離れると、全文はもう出ません。漏れたと思ったら **取り消す**。

ワークフローは [`.github/workflows/mcp-function.yml`](../.github/workflows/mcp-function.yml) です。Supabase CLI は 3 系で、`--yes` と `--remote=` を付けます。ページ公開のワークフローとは別です。

## トークン

- 設定画面が乱数を作り、SHA-256 の16進だけを Supabase に保存します。生のトークンはデータベースに残りません。
- **読むだけ** は参照だけです。追加・更新・削除は拒否します。
- **読み書き** は追加と更新と削除ができます。削除は `confirm` が `true` のときだけです。
- 1分に60回を超えると、少し待ちます。
- Claude や ChatGPT のログイン画面（OAuth）からつなぐと、同じ表に「外部接続」として残ります。設定画面から取り消せます。
- 追加した予定や Todo は `source=app`、`created_by=mcp` です。朝の組み直しで、自分で入れた予定と同じく残ります。

## Claude Desktop

リモート接続が簡単です。`service_role` は不要です。

設定ファイル（macOS は `~/Library/Application Support/Claude/claude_desktop_config.json`）:

```json
{
  "mcpServers": {
    "lifemanager": {
      "url": "https://oynfsgxgpsotvbqbpksl.supabase.co/functions/v1/mcp",
      "headers": {
        "Authorization": "Bearer lm_ここにトークン"
      }
    }
  }
}
```

Claude を開き直して、コネクタに LIFEMANAGER が出ることを確認します。

このリポジトリを手元で動かす場合だけ、stdio も使えます。Node.js 22 が必要です。リモートの方が安全です。手元のファイルに `service_role` を置くと、その PC の AI がファイルを読めることがあります。

`lifemanager/.env.mcp`（Git には入りません）:

```text
SUPABASE_URL=https://oynfsgxgpsotvbqbpksl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=サービスロールの鍵。AIのチャットには貼らない
LIFEMANAGER_MCP_TOKEN=lm_設定画面のトークン
```

```json
{
  "mcpServers": {
    "lifemanager": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/手元の/lifemanager"
    }
  }
}
```

## claude.ai（ブラウザ）

**Customize → Connectors → Add custom connector**。名前は LIFEMANAGER。URL は上の接続先です。

1. **Request headers** が見える場合: Authentication は **No sign in**。ヘッダー名 `Authorization`、値は `Bearer lm_トークン`。
2. ヘッダー欄が無い場合: **OAuth** のまま進む。LIFEMANAGER と同じメールアドレスとパスワードで入り、権限を選ぶ。作られたトークンは、アプリの設定に「外部接続」と出ます。

組織のプランでヘッダー欄が無いことがあります。そのときは OAuth です。

## ChatGPT

ウェブの ChatGPT で、開発者モード（Developer mode）をオンにします。**Plugins → Add custom MCP server**（表示は「カスタム MCP」のことがあります）。

- 名前: LIFEMANAGER
- Server URL: 上の接続先
- 認証: **OAuth**

作成したあと、会話で接続するとログイン画面が開きます。LIFEMANAGER と同じメールアドレスとパスワードです。権限は「読むだけ」か「読み書き」を選びます。ChatGPT は固定の Bearer ヘッダーを付けられないので、このログインを使います。

取り消すときは、アプリの設定でその行の **取り消す** を押します。

## Cursor

Cursor の MCP 設定（`~/.cursor/mcp.json` か、Settings → MCP）:

```json
{
  "mcpServers": {
    "lifemanager": {
      "url": "https://oynfsgxgpsotvbqbpksl.supabase.co/functions/v1/mcp",
      "headers": {
        "Authorization": "Bearer lm_ここにトークン"
      }
    }
  }
}
```

## ツール

名前は英語、説明は日本語と英語です。日付は東京の `YYYY-MM-DD` です。

予定・Todo・やりたいこと・起床就寝・移動は、一覧、1件、追加、更新、完了（あるものだけ）、削除です。削除には `confirm: true` が必要です。

| グループ | ツール |
| --- | --- |
| Todo | `list_todos` `get_todo` `create_todo` `update_todo` `complete_todo` `delete_todo` |
| 予定 | `list_schedule_blocks`（日付が必須）`get_schedule_block` `create_schedule_block` `update_schedule_block` `complete_schedule_block` `delete_schedule_block` |
| やりたいこと | `list_wishes` `get_wish` `create_wish` `update_wish` `complete_wish` `delete_wish` |
| 起床・就寝 | `list_wake_sleep` `get_wake_sleep` `log_wake_sleep` `update_wake_sleep` `delete_wake_sleep` |
| 変更要望 | `list_change_requests` `get_change_request` `reply_change_request` |
| 移動 | `list_travel_times` `get_travel_time` `create_travel_time` `update_travel_time` `delete_travel_time` |
| 設定 | `get_settings`（読むだけ） |
| 表現 | `add_expression` `search_expressions` `get_expression` `delete_expression` |
| 教材 | `log_study_resource` `list_study_resources` `get_study_resource` `delete_study_resource` |
| 質問 | `log_grammar_question` `list_grammar_questions` `get_grammar_question` `answer_grammar_question` |
| 作文 | `submit_composition` `list_compositions` `get_composition` `correct_composition` |
| 課題 | `create_assignment` `list_assignments` `get_assignment` `submit_assignment` `review_assignment` |
| まとめ | `study_log_summary` |
| 会話・発音 | `list_speaking_sessions` `get_speaking_session` `list_pronunciation_attempts` `get_pronunciation_attempt` |

英語の役割は、アプリの仕様と同じです。`app` は本人、`tutor` はチューター、`writer` はライター、`researcher` はリサーチャーです。質問の回答は `status` と `answer` と `answered_by` を一度に書きます。作文の添削は `corrected_text` と `explanation`（日本語）と `corrected_by` を一度に書きます。課題のフィードバックも同じです。

予定の時刻は10分単位です。終了だけ `24:00` を使えます。

## 動作確認

手元のデータベースにはつなぎません。トークンの照合、ツール一覧、削除の確認フラグ、読み取り専用、英語の回答と添削、OAuth の PKCE、大きすぎる本文を、メモリ上の表で試しています。

```bash
npm test
```

2026-11-26 にこのリポジトリで実行し、15件すべて成功しました。中身は `initialize`、`tools/list`、`tools/call`（Todo の一覧）、`confirm` が無い削除は消えないこと、読むだけのトークンは追加できないこと、認可コードをトークンに交換したあと生のトークンも service_role も保存されていないことです。

OAuth の発見用 URL は次です。

```text
https://oynfsgxgpsotvbqbpksl.supabase.co/functions/v1/mcp/.well-known/openid-configuration
```

## 困ったとき

- 設定に「表がまだありません」と出る: `mcp_tokens.sql` がまだです。
- AI が 401 になる: トークンの先頭が `lm_` か、取り消していないか。`service_role` や anon key では入れません。
- 読むだけなのに書けない: 仕様です。読み書きのトークンを別に作ります。
- 削除されない: `confirm` が `true` でないと消しません。
- デプロイがスキップされた: `SUPABASE_ACCESS_TOKEN` が Actions の秘密にありません。入れてから **Run workflow**。
- ページが古い: MCP はページの中には入りません。アプリの設定を開き直します。
