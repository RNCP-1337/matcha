import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transport = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTransport() {
  if (transport) return transport;
  if (!config.mail.host) return null;

  transport = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,
    tls: { rejectUnauthorized: config.isProduction || !['localhost', '127.0.0.1'].includes(config.mail.host) },
  });
  return transport;
}

async function spool(message) {
  await mkdir(config.mail.spoolDir, { recursive: true });
  const name = `${Date.now()}-${message.to.replace(/[^a-z0-9]/gi, '_')}.eml`;
  const content = [
    `From: ${config.mail.from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    '',
    message.text,
  ].join('\n');
  await writeFile(join(config.mail.spoolDir, name), content, 'utf8');
  console.log(`[mail] spooled to ${join(config.mail.spoolDir, name)}`);
}

async function send(message) {
  const mailer = getTransport();
  if (!mailer) {
    await spool(message);
    return;
  }
  try {
    await mailer.sendMail({ from: config.mail.from, ...message });
  } catch (error) {
    console.error(`[mail] delivery failed (${error.message}), spooling instead`);
    await spool(message);
  }
}

function layout(title, bodyHtml) {
  return `<!doctype html>
<html><body style="font-family: Helvetica, Arial, sans-serif; color: #222; line-height: 1.5;">
<h2 style="margin:0 0 16px 0; font-size: 18px;">${escapeHtml(title)}</h2>
${bodyHtml}
<p style="color:#777; font-size:12px; margin-top:24px;">Matcha &mdash; if you did not expect this email you can ignore it.</p>
</body></html>`;
}

export async function sendVerificationEmail(user, token) {
  const link = `${config.publicUrl}/verify?token=${encodeURIComponent(token)}`;
  await send({
    to: user.email,
    subject: 'Confirm your Matcha account',
    text: `Hello ${user.first_name},\n\nConfirm your account: ${link}\n\nThe link expires in 24 hours.`,
    html: layout(
      'Confirm your Matcha account',
      `<p>Hello ${escapeHtml(user.first_name)},</p>
       <p>Confirm your address to activate your account.</p>
       <p><a href="${link}" style="background:#2f5d3a;color:#fff;padding:10px 16px;text-decoration:none;">Confirm my account</a></p>
       <p style="font-size:13px;color:#555;">Or paste this link in your browser:<br>${escapeHtml(link)}</p>
       <p style="font-size:13px;color:#555;">The link expires in 24 hours.</p>`,
    ),
  });
}

export async function sendPasswordResetEmail(user, token) {
  const link = `${config.publicUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await send({
    to: user.email,
    subject: 'Reset your Matcha password',
    text: `Hello ${user.first_name},\n\nReset your password: ${link}\n\nThe link expires in 1 hour.`,
    html: layout(
      'Reset your Matcha password',
      `<p>Hello ${escapeHtml(user.first_name)},</p>
       <p>Use the link below to choose a new password.</p>
       <p><a href="${link}" style="background:#2f5d3a;color:#fff;padding:10px 16px;text-decoration:none;">Choose a new password</a></p>
       <p style="font-size:13px;color:#555;">Or paste this link in your browser:<br>${escapeHtml(link)}</p>
       <p style="font-size:13px;color:#555;">The link expires in 1 hour.</p>`,
    ),
  });
}
