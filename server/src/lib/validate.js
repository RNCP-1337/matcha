import { commonWords } from './common-words.js';
import { badRequest } from './httpError.js';

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
const NAME_RE = /^[\p{L}][\p{L} '-]{0,49}$/u;
const TAG_RE = /^[a-z0-9]{2,24}$/;

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', $: 's', '@': 'a', '!': 'i' };

export class ValidationError extends Error {
  constructor(fields) {
    super('Validation failed');
    this.status = 400;
    this.fields = fields;
  }
}

export function fail(fields) {
  throw new ValidationError(fields);
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function checkEmail(value) {
  const email = asString(value).toLowerCase();
  if (!email) return { error: 'Email is required' };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { error: 'Enter a valid email address' };
  return { value: email };
}

export function checkUsername(value) {
  const username = asString(value);
  if (!username) return { error: 'Username is required' };
  if (!USERNAME_RE.test(username)) {
    return { error: 'Use 3 to 20 letters, digits, hyphens or underscores' };
  }
  return { value: username };
}

export function checkName(value, label) {
  const name = asString(value);
  if (!name) return { error: `${label} is required` };
  if (!NAME_RE.test(name)) return { error: `${label} contains invalid characters` };
  return { value: name };
}

function dictionaryCandidates(password) {
  const lowered = password.toLowerCase();
  const trimmed = lowered.replace(/^[^a-z0-9]+/, '').replace(/[^a-z0-9]+$/, '').replace(/[0-9]+$/, '');

  let translated = '';
  for (const char of trimmed) translated += LEET[char] ?? char;

  return new Set([lowered, trimmed, translated.replace(/[^a-z]/g, ''), lowered.replace(/[^a-z]/g, '')]);
}

export function checkPassword(value, context = {}) {
  const password = typeof value === 'string' ? value : '';

  if (password.length < 8) return { error: 'Password must be at least 8 characters long' };
  if (password.length > 128) return { error: 'Password must be at most 128 characters long' };
  if (!/[a-z]/.test(password)) return { error: 'Password must contain a lowercase letter' };
  if (!/[A-Z]/.test(password)) return { error: 'Password must contain an uppercase letter' };
  if (!/[0-9]/.test(password)) return { error: 'Password must contain a digit' };
  if (!/[^A-Za-z0-9]/.test(password)) return { error: 'Password must contain a special character' };
  if (/(.)\1{3,}/.test(password)) return { error: 'Password repeats the same character too often' };

  for (const candidate of dictionaryCandidates(password)) {
    if (candidate.length >= 3 && commonWords.has(candidate)) {
      return { error: 'This password is a common word. Pick something less predictable' };
    }
  }

  for (const hint of [context.username, context.email?.split('@')[0], context.firstName, context.lastName]) {
    const needle = asString(hint).toLowerCase();
    if (needle.length >= 3 && password.toLowerCase().includes(needle)) {
      return { error: 'Password must not contain your name, username or email' };
    }
  }

  return { value: password };
}

export function checkGender(value) {
  const gender = asString(value).toLowerCase();
  if (!['male', 'female', 'other'].includes(gender)) return { error: 'Select a gender' };
  return { value: gender };
}

export function checkPreference(value) {
  const preference = asString(value).toLowerCase() || 'bisexual';
  if (!['heterosexual', 'homosexual', 'bisexual'].includes(preference)) {
    return { error: 'Select a valid sexual preference' };
  }
  return { value: preference };
}

export function checkBiography(value) {
  const bio = typeof value === 'string' ? value.trim() : '';
  if (bio.length > 1000) return { error: 'Biography must be at most 1000 characters' };
  return { value: bio };
}

export function checkBirthDate(value) {
  const raw = asString(value);
  if (!raw) return { error: 'Date of birth is required' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { error: 'Use the format YYYY-MM-DD' };

  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { error: 'Enter a valid date' };

  const age = ageFrom(raw);
  if (age < 18) return { error: 'You must be at least 18 years old' };
  if (age > 120) return { error: 'Enter a valid date of birth' };
  return { value: raw };
}

export function ageFrom(birthDate) {
  const born = new Date(`${birthDate}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

export function checkTags(value) {
  if (!Array.isArray(value)) return { error: 'Interests must be a list' };
  const tags = [];
  for (const entry of value) {
    const tag = asString(entry).toLowerCase().replace(/^#/, '');
    if (!TAG_RE.test(tag)) {
      return { error: `"${entry}" is not a valid interest: use 2 to 24 letters or digits` };
    }
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > 20) return { error: 'You can pick at most 20 interests' };
  return { value: tags };
}

export function checkCity(value, label = 'City') {
  const city = asString(value);
  if (!city) return { error: `${label} is required` };
  if (city.length > 80) return { error: `${label} is too long` };
  if (!/^[\p{L}\p{N} .,'()-]+$/u.test(city)) return { error: `${label} contains invalid characters` };
  return { value: city };
}

export function checkCoordinate(value, kind) {
  const number = Number(value);
  if (!Number.isFinite(number)) return { error: `Invalid ${kind}` };
  const bound = kind === 'latitude' ? 90 : 180;
  if (number < -bound || number > bound) return { error: `Invalid ${kind}` };
  return { value: number };
}

export function checkMessage(value) {
  const body = typeof value === 'string' ? value.trim() : '';
  if (!body) return { error: 'Message cannot be empty' };
  if (body.length > 2000) return { error: 'Message must be at most 2000 characters' };
  return { value: body };
}

export function collect(entries) {
  const fields = {};
  const values = {};
  for (const [key, result] of Object.entries(entries)) {
    if (result.error) fields[key] = result.error;
    else values[key] = result.value;
  }
  if (Object.keys(fields).length > 0) fail(fields);
  return values;
}

export function intParam(value, { min, max, fallback }) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  if (number < min || number > max) return fallback;
  return number;
}

export function enumParam(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function requireBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Invalid request body');
  return body;
}
