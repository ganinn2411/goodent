// Goodent — şifre sıfırlama e-postasını kullanıcının uygulama diliyle (tr / en / ar) gönderir.
// Akış: uygulama -> bu fonksiyon -> Supabase'den recovery bağlantısı üretir -> SMTP ile dile uygun mail gönderir.
//
// Gerekli secret'lar (Dashboard > Edge Functions > Secrets veya `supabase secrets set`):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
// (SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY otomatik tanımlıdır.)

import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

type Lang = 'tr' | 'en' | 'ar'

const T: Record<Lang, Record<string, string>> = {
  tr: {
    subject: 'Şifrenizi sıfırlayın — Goodent',
    sub: 'Laboratuvar',
    title: 'Şifrenizi sıfırlayın',
    body: 'Hesabınız için şifre sıfırlama isteği aldık. Yeni bir şifre belirlemek için aşağıdaki düğmeye dokunun.',
    account: 'HESAP',
    button: 'Yeni şifre belirle',
    note: 'Bağlantı sınırlı bir süre geçerlidir. Düğme çalışmazsa bu bağlantıyı tarayıcınıza yapıştırın:',
    ignore: 'Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.',
  },
  en: {
    subject: 'Reset your password — Goodent',
    sub: 'Laboratory',
    title: 'Reset your password',
    body: 'We received a request to reset the password for your account. Tap the button below to set a new password.',
    account: 'ACCOUNT',
    button: 'Set new password',
    note: 'The link is valid for a limited time. If the button does not work, paste this link into your browser:',
    ignore: 'If you did not request this, you can ignore this email.',
  },
  ar: {
    subject: 'إعادة تعيين كلمة المرور — Goodent',
    sub: 'مختبر',
    title: 'إعادة تعيين كلمة المرور',
    body: 'لقد تلقينا طلبًا لإعادة تعيين كلمة المرور لحسابك. اضغط على الزر أدناه لتعيين كلمة مرور جديدة.',
    account: 'الحساب',
    button: 'تعيين كلمة مرور جديدة',
    note: 'الرابط صالح لفترة محدودة. إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:',
    ignore: 'إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.',
  },
}

function buildHtml(lang: Lang, email: string, link: string) {
  const t = T[lang]
  const rtl = lang === 'ar'
  const dir = rtl ? 'rtl' : 'ltr'
  const align = rtl ? 'right' : 'left'
  const href = esc(link)
  return `<!doctype html>
<html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#eef4fb;">
<div dir="${dir}" style="background:#eef4fb;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;text-align:${align};">
  <div style="max-width:520px;margin:0 auto;border-radius:20px;overflow:hidden;background:#ffffff;">
    <div style="background:#0b1020;padding:28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" dir="${dir}"><tr>
        <td style="background:#2563eb;border-radius:14px;width:56px;height:56px;text-align:center;font-size:30px;">🦷</td>
        <td style="padding-${rtl ? 'right' : 'left'}:16px;text-align:${align};">
          <div style="color:#ffffff;font-size:24px;font-weight:700;">Goodent</div>
          <div style="color:#9fb0d0;font-size:14px;">${esc(t.sub)}</div>
        </td>
      </tr></table>
    </div>
    <div style="padding:28px;">
      <h1 style="margin:0 0 12px;font-size:24px;color:#0b1020;">${esc(t.title)}</h1>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#475569;">${esc(t.body)}</p>
      <div style="background:#f1f6fd;border:1px solid #dbe6f5;border-radius:14px;padding:14px 18px;margin-bottom:22px;">
        <div style="font-size:12px;letter-spacing:1px;font-weight:700;color:#64748b;">${esc(t.account)}</div>
        <div dir="ltr" style="font-size:18px;font-weight:600;color:#2563eb;text-align:${align};">${esc(email)}</div>
      </div>
      <a href="${href}" style="display:block;text-align:center;background:#2563eb;color:#ffffff;text-decoration:none;font-size:17px;font-weight:700;padding:16px;border-radius:14px;">${esc(t.button)}</a>
      <p style="margin:22px 0 8px;font-size:14px;line-height:1.7;color:#64748b;">${esc(t.note)}</p>
      <p dir="ltr" style="margin:0 0 16px;font-size:13px;word-break:break-all;text-align:left;"><a href="${href}" style="color:#2563eb;">${href}</a></p>
      <p style="margin:0;font-size:13px;color:#94a3b8;">${esc(t.ignore)}</p>
    </div>
  </div>
</div>
</body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false }, 405)

  let body: { email?: string; lang?: string; redirectTo?: string }
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad_request' }, 400) }

  const email = String(body.email ?? '').trim().toLowerCase()
  const lang: Lang = (['tr', 'en', 'ar'] as const).includes(body.lang as Lang) ? (body.lang as Lang) : 'tr'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: 'invalid_email' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Kayıtlı olmayan adreslerde de aynı cevabı dön (e-posta var mı yok mu belli olmasın).
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: body.redirectTo ? { redirectTo: body.redirectTo } : undefined,
  })
  const link = data?.properties?.action_link
  if (error || !link) {
    console.error('generate_link_failed', error)
    return json({ ok: true })
  }

  // Secret'ları oku; baştaki/sondaki boşluk ve tırnakları temizle
  const env = (k: string) => (Deno.env.get(k) ?? '').trim().replace(/^["']|["']$/g, '')
  const host = env('SMTP_HOST'), user = env('SMTP_USER'), pass = env('SMTP_PASS').replace(/\s+/g, '')
  const from = env('SMTP_FROM') || user
  // Arapça/Farsça rakamlarla yazılmış değerleri (٤٦٥ gibi) Latin rakama çevir
  const latin = (v: string) => v
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
  const port = Number(latin(env('SMTP_PORT')) || '465') || 465
  const missing = Object.entries({ SMTP_HOST: host, SMTP_USER: user, SMTP_PASS: pass }).filter(([, v]) => !v).map(([k]) => k)
  if (missing.length) {
    console.error('missing_secrets: ' + missing.join(', '))
    return json({ ok: false, error: 'missing_secrets' }, 500)
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })
    await transporter.sendMail({
      from,
      to: email,
      subject: T[lang].subject,
      text: `${T[lang].title}\n\n${T[lang].body}\n\n${link}\n\n${T[lang].ignore}`,
      html: buildHtml(lang, email, link),
    })
    transporter.close()
  } catch (e) {
    console.error('smtp_failed', e)
    // GEÇİCİ: hatayı bulduktan sonra aşağıdaki detail alanını silin
    return json({ ok: false, error: 'send_failed', detail: String(e), host, port, user }, 500)
  }

  return json({ ok: true })
})
