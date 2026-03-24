import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveOAuthRedirectUrl } from '../utils/auth/oauth.ts';
import { buildSystemPromptFromSettings, findLatestStudyImage, formatSessionRelative, normalizeSettings } from '../utils/studentChat.ts';

test('resolveOAuthRedirectUrl prefers native scheme for webview', () => {
  assert.equal(
    resolveOAuthRedirectUrl({ isNativeWebView: true, currentOrigin: 'https://preview.forteenai.com' }),
    'forteenai://auth/callback',
  );
});

test('resolveOAuthRedirectUrl uses runtime origin when available', () => {
  assert.equal(
    resolveOAuthRedirectUrl({ isNativeWebView: false, currentOrigin: 'https://preview.forteenai.com' }),
    'https://preview.forteenai.com/auth/callback',
  );
});

test('normalizeSettings preserves supported aliases and defaults', () => {
  const settings = normalizeSettings({
    guardrails: { block_harmful: false, self_directed: true },
    mentor_style: 'friendly',
    parent_instructions: ['  규칙 1  ', 123 as never, ''],
  } as never);

  assert.equal(settings.guardrails.sexual_block, false);
  assert.equal(settings.guardrails.self_directed_mode, true);
  assert.equal(settings.guardrails.clean_language, true);
  assert.equal(settings.mentor_tone, 'friendly');
  assert.deepEqual(settings.parent_instructions, ['  규칙 1  ']);
});

test('buildSystemPromptFromSettings includes configured sections', () => {
  const prompt = buildSystemPromptFromSettings({
    guardrails: {
      sexual_block: true,
      self_directed_mode: false,
      overuse_prevent: true,
      clean_language: false,
    },
    mentor_tone: 'rational',
    parent_instructions: ['숙제 정답은 바로 주지 않기'],
    ai_style_prompt: '친절하되 짧게 답하기',
  });

  assert.match(prompt, /Parent Guardrails/);
  assert.match(prompt, /차분하고 구조적인 톤/);
  assert.match(prompt, /숙제 정답은 바로 주지 않기/);
  assert.match(prompt, /친절하되 짧게 답하기/);
});

test('findLatestStudyImage finds most recent user image tag', () => {
  const image = findLatestStudyImage([
    { role: 'user', text: '안녕' },
    { role: 'model', text: '반가워요' },
    { role: 'user', text: '문제에요 [IMAGE]abc123[/IMAGE]' },
  ] as never);

  assert.equal(image, 'abc123');
});

test('formatSessionRelative returns humanized labels', () => {
  const now = new Date('2026-03-23T12:00:00Z');
  assert.equal(formatSessionRelative('2026-03-23T11:30:00Z', now), '30분 전');
  assert.equal(formatSessionRelative('2026-03-22T12:00:00Z', now), '어제');
});


test('resolveOAuthRedirectUrl falls back to local development callback on port 3000', () => {
  assert.equal(
    resolveOAuthRedirectUrl({ isNativeWebView: false, currentOrigin: undefined, envRedirectUrl: undefined }),
    'http://localhost:3000/auth/callback',
  );
});
