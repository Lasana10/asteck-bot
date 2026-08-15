#!/usr/bin/env node

const REQUIRED_API_URL = 'https://asteck-bot.onrender.com';
const REQUIRED_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_API_URL',
  'VITE_TURNSTILE_SITE_KEY',
];
const SUPABASE_KEY_OPTIONS = [
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
];
const SECRET_LIKE_PATTERNS = [
  /service[_-]?role/i,
  /^sb_secret_/i,
  /^sbp?_service/i,
];

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function looksLikeSecret(value) {
  return SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(String(value || '')));
}

function collectErrors(env) {
  const errors = [];

  for (const key of REQUIRED_KEYS) {
    if (!String(env[key] || '').trim()) {
      errors.push(`${key} is required`);
    }
  }

  const publishableKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  const anonKey = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!publishableKey && !anonKey) {
    errors.push('One of VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY is required');
  }

  for (const key of ['VITE_SUPABASE_URL', 'VITE_API_URL']) {
    const value = String(env[key] || '').trim();
    if (value && !isHttpsUrl(value)) {
      errors.push(`${key} must be a valid HTTPS URL`);
    }
  }

  if (String(env.VITE_API_URL || '').trim() && String(env.VITE_API_URL).trim() !== REQUIRED_API_URL) {
    errors.push(`VITE_API_URL must be ${REQUIRED_API_URL}`);
  }

  for (const key of SUPABASE_KEY_OPTIONS) {
    const value = String(env[key] || '').trim();
    if (value && looksLikeSecret(value)) {
      errors.push(`${key} must not expose a Supabase service-role or secret key`);
    }
  }

  if (looksLikeSecret(String(env.VITE_TURNSTILE_SITE_KEY || '').trim())) {
    errors.push('VITE_TURNSTILE_SITE_KEY looks like a secret value');
  }

  return errors;
}

function validateEnv(env, label) {
  const errors = collectErrors(env);
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[AFAT env guard] ${label}: ${error}`);
    }
    return false;
  }

  const keySource = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
    ? 'VITE_SUPABASE_PUBLISHABLE_KEY'
    : 'VITE_SUPABASE_ANON_KEY';
  console.log(`[AFAT env guard] ${label}: OK (${keySource}, HTTPS URLs, Turnstile key present)`);
  return true;
}

function runScenario(mode) {
  if (mode === 'missing') {
    const sample = {
      CF_PAGES: '1',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_API_URL: '',
      VITE_TURNSTILE_SITE_KEY: '',
    };
    return !validateEnv(sample, 'missing-config');
  }

  if (mode === 'complete') {
    const sample = {
      CF_PAGES: '1',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example_public_key',
      VITE_API_URL: REQUIRED_API_URL,
      VITE_TURNSTILE_SITE_KEY: '0x4AAAAAAATESTKEY',
    };
    return validateEnv(sample, 'complete-config');
  }

  if (process.env.CF_PAGES !== '1') {
    console.log('[AFAT env guard] CF_PAGES is not set; skipping Cloudflare build validation.');
    return true;
  }

  return validateEnv(process.env, 'cloudflare-build');
}

const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'runtime';

process.exit(runScenario(mode) ? 0 : 1);
