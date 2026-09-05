import { Resend } from 'resend';

// Initialize Resend lazily to avoid startup errors if API key is missing
let resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    return null;
  }
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// Default sender email (you'll configure this in Resend dashboard).
// NOTE: onboarding@resend.dev is Resend's sandbox sender — fine for
// testing the account that owns the Resend project, but NOT a general
// production sender. Production should set FROM_EMAIL to an address on a
// domain verified in Resend (see FEATURE_FIXES.md).
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const FROM_NAME = 'SnapVault';

/**
 * True when outgoing email is actually possible: a Resend API key is set.
 * Routes use this to return an honest 503 up front instead of accepting a
 * reset request that can never be delivered.
 */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

interface SendPasswordResetEmailParams {
  to: string;
  resetUrl: string;
  userName?: string;
}

interface SendWelcomeEmailParams {
  to: string;
  appUrl: string;
  userName?: string;
}

/**
 * Get properly formatted FROM address
 * Handles cases where FROM_EMAIL already includes a name format
 * Resend accepts: "email@domain.com" or "Name <email@domain.com>"
 */
function getFromAddress(): string {
  // Trim whitespace
  const cleanEmail = FROM_EMAIL.trim();
  
  // If FROM_EMAIL already contains < and >, it's already formatted (e.g., "SnapVault <noreply@domain.com>")
  if (cleanEmail.includes('<') && cleanEmail.includes('>')) {
    // Validate the format is correct
    const match = cleanEmail.match(/^(.+?)\s*<([^>]+)>$/);
    if (match) {
      return cleanEmail; // Already properly formatted
    }
  }
  
  // If it's just an email, wrap it with the name
  // Resend format: "Name <email@domain.com>"
  return `${FROM_NAME} <${cleanEmail}>`;
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
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      console.error('Invalid email format:', to);
      return { success: false, error: 'Invalid email format' };
    }

    // Get Resend client (returns null if API key not configured)
    const client = getResendClient();
    
    if (!client) {
      // SECURITY: never log the reset URL — it contains the raw token.
      console.warn('RESEND_API_KEY not configured. Password reset email not sent.');
      return { success: false, error: 'Email service not configured' };
    }

    const fromAddress = getFromAddress();
    console.log('Sending email with params:', {
      from: fromAddress,
      to: to,
      subject: 'Reset Your SnapVault Password'
    });

    const { data, error } = await client.emails.send({
      from: fromAddress,
      to: to, // Resend expects a string or array of strings
      subject: 'Reset Your SnapVault Password',
      html: getPasswordResetEmailTemplate(resetUrl, userName),
      text: getPasswordResetEmailText(resetUrl, userName),
    });

    if (error) {
      console.error('Resend API error details:', JSON.stringify(error, null, 2));
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
 * Welcome email sent after a new account is created.
 */
export async function sendWelcomeEmail({
  to,
  appUrl,
  userName = 'there',
}: SendWelcomeEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      console.error('Invalid email format:', to);
      return { success: false, error: 'Invalid email format' };
    }

    const client = getResendClient();

    if (!client) {
      console.warn('RESEND_API_KEY not configured. Welcome email not sent.');
      return { success: false, error: 'Email service not configured' };
    }

    const fromAddress = getFromAddress();
    const cleanAppUrl = appUrl.replace(/\/$/, '');

    const { data, error } = await client.emails.send({
      from: fromAddress,
      to,
      subject: 'Welcome to SnapVault',
      html: getWelcomeEmailTemplate(cleanAppUrl, userName),
      text: getWelcomeEmailText(cleanAppUrl, userName),
    });

    if (error) {
      console.error('Resend API error details:', JSON.stringify(error, null, 2));
      return { success: false, error: error.message };
    }

    console.log('Welcome email sent successfully:', data?.id);
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

function getWelcomeEmailTemplate(appUrl: string, userName: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to SnapVault</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">
                Welcome to SnapVault
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #1a1a1a; font-size: 24px; font-weight: 600;">
                Your account is ready
              </h2>

              <p style="margin: 0 0 24px; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                Hi ${userName},
              </p>

              <p style="margin: 0 0 24px; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                Your SnapVault account has been created successfully. You can now upload photos and videos, organize them into albums, and access your memories anywhere.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${appUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                      Open SnapVault
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0; color: #4a4a4a; font-size: 14px; line-height: 1.6;">
                If the button does not open correctly, copy and paste this link into your browser:
              </p>

              <p style="margin: 8px 0 24px; padding: 12px; background-color: #f8f9fa; border-radius: 6px; color: #667eea; font-size: 13px; word-break: break-all; border-left: 3px solid #667eea;">
                ${appUrl}
              </p>

              <div style="margin: 32px 0 0; padding: 20px; background-color: #f8f9fa; border-radius: 6px;">
                <p style="margin: 0; color: #6c757d; font-size: 14px; line-height: 1.5;">
                  Keep this email for reference. If you forget your password later, you can always use the password reset flow from the login page.
                </p>
              </div>
            </td>
          </tr>

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

interface SendEmailChangeVerificationParams {
  to: string; // the NEW email address — this is what we're verifying control of
  verifyUrl: string;
  userName?: string;
}

/**
 * Send a verification email to a person's NEW email address when they
 * request an email change from Settings. The account's email is only
 * actually updated once they click through this link — this is what makes
 * email changes verified instead of the previous plain editable text field
 * that saved nothing and proved nothing.
 */
export async function sendEmailChangeVerification({
  to,
  verifyUrl,
  userName = 'there',
}: SendEmailChangeVerificationParams): Promise<{ success: boolean; error?: string }> {
  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      console.error('Invalid email format:', to);
      return { success: false, error: 'Invalid email format' };
    }

    const client = getResendClient();

    if (!client) {
      console.warn('RESEND_API_KEY not configured. Email not sent.');
      console.log('Email verification URL:', verifyUrl);
      return { success: false, error: 'Email service not configured' };
    }

    const fromAddress = getFromAddress();

    const { data, error } = await client.emails.send({
      from: fromAddress,
      to,
      subject: 'Confirm your new SnapVault email address',
      html: getEmailChangeVerificationTemplate(verifyUrl, userName),
    });

    if (error) {
      console.error('Resend API error details:', JSON.stringify(error, null, 2));
      return { success: false, error: error.message };
    }

    console.log('Email change verification sent successfully:', data?.id);
    return { success: true };
  } catch (error: any) {
    console.error('Email service error:', error);
    return { success: false, error: error.message };
  }
}

function getEmailChangeVerificationTemplate(verifyUrl: string, userName: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm your new email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">

          <tr>
            <td style="background: linear-gradient(135deg, #2e63d1 0%, #63a0ed 100%); padding: 40px 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold; letter-spacing: -0.5px;">
                SnapVault
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #1a1a1a; font-size: 24px; font-weight: 600;">
                Confirm your new email address
              </h2>

              <p style="margin: 0 0 24px; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                Hi ${userName},
              </p>

              <p style="margin: 0 0 24px; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                Someone requested to change the email address on a SnapVault account to this one. If that was you, click below to confirm — your account's email won't change until you do.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                <tr>
                  <td align="center">
                    <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #2e63d1 0%, #63a0ed 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(46, 99, 209, 0.4);">
                      Confirm New Email
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0; color: #4a4a4a; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 8px 0 24px; padding: 12px; background-color: #f8f9fa; border-radius: 6px; color: #2e63d1; font-size: 13px; word-break: break-all; border-left: 3px solid #2e63d1;">
                ${verifyUrl}
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
                  If you didn't request this change, you can safely ignore this email — your account's email address will not be changed.
                </p>
              </div>
            </td>
          </tr>

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

/**
 * Plain-text alternative for the password reset email. Every email in this
 * app ships both HTML and text so it stays readable in clients that
 * disable HTML or strip it for security.
 */
function getPasswordResetEmailText(resetUrl: string, userName: string): string {
  return [
    `Hi ${userName},`,
    '',
    'We received a request to reset the password for your SnapVault account.',
    'Open the link below to create a new password:',
    '',
    resetUrl,
    '',
    'This link expires in 1 hour and can only be used once.',
    'If you didn\'t request this, you can safely ignore this email — your password stays unchanged.',
    '',
    '— SnapVault',
  ].join('\n');
}

function getWelcomeEmailText(appUrl: string, userName: string): string {
  return [
    `Hi ${userName},`,
    '',
    'Welcome to SnapVault — your photos and videos, safely in the cloud.',
    `Open the app to get started: ${appUrl}`,
    '',
    '— SnapVault',
  ].join('\n');
}
