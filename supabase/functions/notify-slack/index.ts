/**
 * 「気になる」が押されたときに Slack へ通知する Supabase Edge Function。
 *
 * 経路:
 *   favorites への INSERT
 *     → Supabase の Database Webhook
 *     → この関数（Slack の Webhook URL を秘密として保持）
 *     → Slack の Incoming Webhook
 *
 * なぜ Slack へ直接飛ばさないか:
 *   1. Slack の Incoming Webhook は {"text": ...} 形式しか受け取らない。
 *      Supabase の Webhook がそのまま送る形（type/table/record…）では 400 になる。
 *   2. Slack の Webhook URL は秘密。サイトは Public リポジトリなので絶対に貼れない。
 *      サーバー側のこの関数だけが持つ。
 *
 * ⚠ 未ログインの「気になる」は localStorage にしか無く、ここには届かない。
 *   プライバシーポリシー（第2項・第11項）で「当社が取得することはありません」と
 *   明記しているため、意図的にそうしている。記載を変えない限り通知もできない。
 *
 * ⚠ このファイルに秘密情報を書かないこと。すべて環境変数から読む。
 *   必要な secret: SLACK_WEBHOOK_URL / HOOK_SECRET
 *   （SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で入れる）
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLACK_WEBHOOK_URL = Deno.env.get("SLACK_WEBHOOK_URL") ?? "";
const HOOK_SECRET       = Deno.env.get("HOOK_SECRET") ?? "";
const SITE_URL          = Deno.env.get("SITE_URL") ?? "https://jobs.agent-best.net/";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

function ok(msg: string) { return new Response(msg, { status: 200 }); }
function ng(msg: string, status: number) { return new Response(msg, { status }); }

async function postToSlack(text: string) {
  if (!SLACK_WEBHOOK_URL) { console.warn("SLACK_WEBHOOK_URL が未設定です"); return; }
  const r = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, unfurl_links: false, unfurl_media: false }),
  });
  if (!r.ok) console.error("Slack への送信に失敗:", r.status, await r.text());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ng("method not allowed", 405);

  /* 誰でも叩ける URL なので、合言葉が一致しないものは捨てる。
     これが無いと、外部から偽の通知を流し込まれる。 */
  if (!HOOK_SECRET || req.headers.get("x-hook-secret") !== HOOK_SECRET) {
    return ng("forbidden", 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return ng("bad json", 400); }

  if (body?.table !== "favorites" || body?.type !== "INSERT") {
    return ok("ignored");   /* 対象外のイベントは黙って捨てる */
  }

  const userId: string | undefined = body?.record?.user_id;
  const jobId:  string | undefined = body?.record?.job_id;
  if (!userId || !jobId) return ok("no ids");

  /* 会員のメールアドレス。誰の動きかが分からないと通知の意味がない。 */
  let email = "(取得できず)";
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    if (data?.user?.email) email = data.user.email;
  } catch (e) { console.warn("メールアドレスの取得に失敗", e); }

  /* 連絡してよい相手かどうか。ここが false の人に求人案内を送ってはいけない。 */
  let name = "", consent = false, hasConsentCol = true;
  try {
    const { data, error } = await admin
      .from("profiles").select("full_name,contact_consent").eq("id", userId).maybeSingle();
    if (error) { hasConsentCol = false; }
    else if (data) { name = data.full_name ?? ""; consent = !!data.contact_consent; }
  } catch (e) { console.warn("プロフィールの取得に失敗", e); }

  /* 何件目の★か。1件目と5件目では温度が違う。 */
  let total: number | null = null;
  try {
    const { count } = await admin
      .from("favorites").select("*", { count: "exact", head: true }).eq("user_id", userId);
    total = count ?? null;
  } catch (e) { console.warn("件数の取得に失敗", e); }

  const who = name ? `${name}（${email}）` : email;
  const jobLink = `${SITE_URL}?job=${encodeURIComponent(jobId)}`;
  const consentLine = hasConsentCol
    ? (consent ? "✅ 求人案内の受信に同意あり（連絡できます）"
               : "🚫 受信同意なし（求人案内は送れません）")
    : "⚠️ 受信同意の列が未作成（SUPABASE_SETUP.md の SQL が未実行です）";

  await postToSlack(
    `⭐ *気になる求人が追加されました*\n` +
    `• 会員: ${who}\n` +
    `• 求人: <${jobLink}|${jobId}>\n` +
    `• この会員の「気になる」合計: ${total ?? "?"}件\n` +
    `• ${consentLine}`,
  );

  return ok("sent");
});
