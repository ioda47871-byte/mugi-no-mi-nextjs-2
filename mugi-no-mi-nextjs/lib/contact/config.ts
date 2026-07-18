const MIN_SECRET_LENGTH = 32;

/**
 * お問い合わせフォームを表示してよいかどうかを判定する。
 *
 * Resend・レート制限(Upstash)・受信先メールアドレスに必要な環境変数が
 * すべて揃っている場合のみ true を返す。1つでも欠けている場合はフォームを
 * 表示せず、電話・Instagramへの案内に切り替える(app/contact/page.tsx参照)。
 *
 * 例外は投げない(存在確認のみ)。実際にメール送信を試みた際の詳細な検証・
 * エラーはlib/contact/email.ts / lib/contact/rate-limit.tsが担当する。
 */
export function isContactFormConfigured(): boolean {
  const hasResend = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);

  const hasRateLimit = Boolean(
    process.env.CONTACT_RATE_LIMIT_SECRET &&
      process.env.CONTACT_RATE_LIMIT_SECRET.trim().length >= MIN_SECRET_LENGTH &&
      process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN,
  );

  const isProduction = process.env.VERCEL_ENV === 'production';
  const hasRecipient = isProduction
    ? Boolean(process.env.CONTACT_FORM_TO_EMAIL)
    : Boolean(process.env.CONTACT_FORM_TEST_TO_EMAIL);

  return hasResend && hasRateLimit && hasRecipient;
}
