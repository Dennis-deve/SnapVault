import { Resend } from 'resend';

// Initialize Resend with API key from environment
const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender email (you'll configure this in Resend dashboard)
const FROM_EMAIL = process.env.FROM_EMAIL || 'SnapVault <onboarding@resend.dev>';

interface SendPasswordResetEmailParams {
  to: string;
  resetUrl: string;
  userName?: string;
}

/**
 * Send password reset email with a professional HTML template
 */
export async function sendPasswordResetEmail({
  to,
  resetUrl,
  userName = 'User',
}: SendPasswordResetEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if Resend is configured
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured. Email not sent.');
      console.log('Password reset URL:', resetUrl);
      return { success: false, error: 'Email service not configured' };
    }

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: 'Reset Your SnapVault Password',
      html: getPasswordResetEmailTemplate(resetUrl, userName),
    });

    if (error) {
      console.error('Failed to send email:', error);
      return { success: false, error: error.message };
    }

    console.log('Password reset email sent successfully:', data?.id);
    return { success: true };
  } catch (error: any) {
    console.error('Email service error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Beautiful HTML email template for password reset
 */
function getPasswordResetEmailTemplate(resetUrl: string, userName: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          
          <!-- Header with gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">
                🔒 SnapVault
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #1a1a1a; font-size: 24px; font-weight: 600;">
                Reset Your Password
              </h2>
              
              <p style="margin: 0 0 24px; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                Hi ${userName},
              </p>
              
              <p style="margin: 0 0 24px; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                We received a request to reset the password for your SnapVault account. Click the button below to create a new password:
              </p>
              
              <!-- Reset Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 24px 0 0; color: #4a4a4a; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>
              
              <p style="margin: 8px 0 24px; padding: 12px; background-color: #f8f9fa; border-radius: 6px; color: #667eea; font-size: 13px; word-break: break-all; border-left: 3px solid #667eea;">
                ${resetUrl}
              </p>
              
              <div style="margin: 32px 0 0; padding: 20px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 6px;">
                <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">
                  ⚠️ <strong>Important:</strong> This link will expire in 1 hour for security reasons.
                </p>
              </div>
              
              <div style="margin: 24px 0 0; padding: 20px; background-color: #f8f9fa; border-radius: 6px;">
                <p style="margin: 0 0 8px; color: #6c757d; font-size: 13px; line-height: 1.5;">
                  <strong>Didn't request this?</strong>
                </p>
                <p style="margin: 0; color: #6c757d; font-size: 13px; line-height: 1.5;">
                  If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f8f9fa; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="margin: 0 0 8px; color: #6c757d; font-size: 14px;">
                Keep your memories safe with SnapVault
              </p>
              <p style="margin: 0; color: #adb5bd; font-size: 12px;">
                © ${new Date().getFullYear()} SnapVault. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Spacer -->
        <table width="600" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
          <tr>
            <td style="text-align: center; color: #6c757d; font-size: 12px; line-height: 1.5;">
              This is an automated message, please do not reply to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
