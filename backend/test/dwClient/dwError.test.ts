import { describe, it, expect } from 'vitest';
import { extractDwFriendlyMessage } from '../../src/dwClient/http.js';

describe('extractDwFriendlyMessage', () => {
  it('returns FriendlyMessage from an iqmsServiceError payload', () => {
    const data = {
      iqmsServiceError: {
        FriendlyMessage: 'No recipe card found. Arinvt_id:191715;',
        ExceptionMessage: 'No recipe card found. Arinvt_id:191715;',
      },
    };
    expect(extractDwFriendlyMessage(data)).toBe('No recipe card found. Arinvt_id:191715;');
  });

  it('falls back to ExceptionMessage when FriendlyMessage is missing or blank', () => {
    expect(extractDwFriendlyMessage({ iqmsServiceError: { ExceptionMessage: 'boom' } })).toBe('boom');
    expect(extractDwFriendlyMessage({ iqmsServiceError: { FriendlyMessage: '   ', ExceptionMessage: 'boom' } })).toBe('boom');
  });

  it('trims surrounding whitespace and newlines', () => {
    const data = { iqmsServiceError: { FriendlyMessage: "  Missing mandatory field 'Lot #'.\r\n " } };
    expect(extractDwFriendlyMessage(data)).toBe("Missing mandatory field 'Lot #'.");
  });

  it('returns undefined when the body is not a DW service error', () => {
    expect(extractDwFriendlyMessage(undefined)).toBeUndefined();
    expect(extractDwFriendlyMessage(null)).toBeUndefined();
    expect(extractDwFriendlyMessage('plain string')).toBeUndefined();
    expect(extractDwFriendlyMessage({})).toBeUndefined();
    expect(extractDwFriendlyMessage({ iqmsServiceError: {} })).toBeUndefined();
    expect(extractDwFriendlyMessage({ iqmsServiceError: { FriendlyMessage: '' } })).toBeUndefined();
  });
});
