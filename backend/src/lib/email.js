/**
 * Email utility — Nodemailer + Gmail SMTP
 *
 * Required env vars (.env):
 *   GMAIL_USER         e.g. stevofrush@gmail.com
 *   GMAIL_APP_PASSWORD 16-char app password from myaccount.google.com/apppasswords
 *
 * If either var is missing, falls back to console.log (safe for dev).
 */

const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
  if (!user || !pass) return null;
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return _transporter;
}

async function send({ to, subject, html, text }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`\n📧  [EMAIL DISABLED — set GMAIL_USER + GMAIL_APP_PASSWORD to enable]
  To:      ${to}
  Subject: ${subject}
  Body:    ${text ?? '(html only)'}
`);
    return;
  }
  await transporter.sendMail({
    from: `"Visitor Management" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    text,
  });
}

async function sendVisitorRegistrationEmail({
  visitorEmail, visitorName, studentName, institutionName, verificationCode,
}) {
  const subject = `Your visitor verification code — ${institutionName}`;
  const text = `Hi ${visitorName},\n\nYou have been registered as a visitor by ${studentName} at ${institutionName}.\n\nYour verification code: ${verificationCode}\n\nPresent this code to the security officer at the gate on the day of your visit.\nThis code is unique to you — please do not share it.\n\nBest regards,\n${institutionName} Visitor Management`;
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#030213;padding:24px">
  <h2 style="margin-top:0">Your visitor verification code</h2>
  <p>Hi <strong>${visitorName}</strong>,</p>
  <p>You have been registered as a visitor by <strong>${studentName}</strong> at <strong>${institutionName}</strong>.</p>
  <div style="background:#F5F0E8;border:1px solid rgba(0,0,0,0.1);border-radius:8px;padding:20px 24px;margin:24px 0;text-align:center">
    <p style="margin:0 0 6px;font-size:0.8rem;color:#717182;text-transform:uppercase;letter-spacing:0.05em">Your verification code</p>
    <p style="margin:0;font-size:2rem;font-weight:800;letter-spacing:0.15em">${verificationCode}</p>
  </div>
  <p>Present this code to the security officer at the gate on the day of your visit.</p>
  <p style="color:#717182;font-size:0.85rem">This code is unique to you — please do not share it.</p>
  <hr style="border:none;border-top:1px solid rgba(0,0,0,0.1);margin:24px 0">
  <p style="color:#717182;font-size:0.8rem;margin:0">${institutionName} Visitor Management</p>
</body>
</html>`;
  await send({ to: visitorEmail, subject, html, text });
}

async function sendVisitCompletedEmail({
  visitorEmail, visitorName, institutionName,
  checkInTime, checkOutTime, securityOfficerName, hallOfficerName,
}) {
  const subject = `Visit completed — ${institutionName}`;
  const text = `Hi ${visitorName},\n\nYour visit to ${institutionName} has been completed.\n\n  Check-in:   ${checkInTime}\n  Check-out:  ${checkOutTime}\n  Security:   ${securityOfficerName}${hallOfficerName ? `\n  Hall Officer: ${hallOfficerName}` : ''}\n\nThank you for visiting.\n\n${institutionName} Visitor Management`;
  const html = `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#030213;padding:24px">
  <h2 style="margin-top:0">Visit completed</h2>
  <p>Hi <strong>${visitorName}</strong>,</p>
  <p>Your visit to <strong>${institutionName}</strong> has been completed.</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0">
    <tr>
      <td style="padding:10px 14px;background:#F5F0E8;font-size:0.78rem;color:#717182;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;width:40%">Check-in</td>
      <td style="padding:10px 14px;background:#F5F0E8;font-weight:600">${checkInTime}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;background:#EDE7DC;font-size:0.78rem;color:#717182;text-transform:uppercase;letter-spacing:0.04em;font-weight:600">Check-out</td>
      <td style="padding:10px 14px;background:#EDE7DC;font-weight:600">${checkOutTime}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;background:#F5F0E8;font-size:0.78rem;color:#717182;text-transform:uppercase;letter-spacing:0.04em;font-weight:600">Security</td>
      <td style="padding:10px 14px;background:#F5F0E8">${securityOfficerName}</td>
    </tr>
    ${hallOfficerName ? `<tr>
      <td style="padding:10px 14px;background:#EDE7DC;font-size:0.78rem;color:#717182;text-transform:uppercase;letter-spacing:0.04em;font-weight:600">Hall Officer</td>
      <td style="padding:10px 14px;background:#EDE7DC">${hallOfficerName}</td>
    </tr>` : ''}
  </table>
  <p>Thank you for visiting. We hope you had a pleasant experience.</p>
  <hr style="border:none;border-top:1px solid rgba(0,0,0,0.1);margin:24px 0">
  <p style="color:#717182;font-size:0.8rem;margin:0">${institutionName} Visitor Management</p>
</body>
</html>`;
  await send({ to: visitorEmail, subject, html, text });
}

module.exports = { sendVisitorRegistrationEmail, sendVisitCompletedEmail };
