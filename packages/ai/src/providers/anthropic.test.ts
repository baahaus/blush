import { describe, expect, it } from 'vitest';
import { getAnthropicRetryDelayMs } from './anthropic.js';

describe('getAnthropicRetryDelayMs', () => {
  it('uses short retry-after values when they are within the interactive cap', () => {
    expect(getAnthropicRetryDelayMs('3', 0)).toBe(3000);
  });

  it('falls back to short exponential backoff when retry-after is missing', () => {
    expect(getAnthropicRetryDelayMs(null, 0)).toBe(2000);
    expect(getAnthropicRetryDelayMs(null, 2)).toBe(6000);
  });

  it('fails fast when retry-after exceeds the interactive cap', () => {
    expect(getAnthropicRetryDelayMs('10332', 0)).toBeNull();
  });
});
