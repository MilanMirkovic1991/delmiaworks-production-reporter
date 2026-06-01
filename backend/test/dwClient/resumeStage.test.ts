import { describe, it, expect } from 'vitest';
import { resolveResumeStage } from '../../src/dwClient/po.js';

describe('resolveResumeStage', () => {
  it('returns "fresh" when CreatePOReceipt never succeeded (no poReceiptId)', () => {
    expect(resolveResumeStage({})).toBe('fresh');
    expect(resolveResumeStage({ poReceiptId: 0 })).toBe('fresh');
    expect(resolveResumeStage({ priorError: 'CreatePOReceipt failed: boom' })).toBe('fresh');
  });

  it('returns "fromPost" when receipt + label exist and only the Post step failed', () => {
    expect(resolveResumeStage({
      poReceiptId: 9001,
      priorError: 'PostPOReceiptAndUpdateMasterLabel failed: cannot post',
    })).toBe('fromPost');
  });

  it('returns "fromLabels" when the receipt exists but the label-plan step failed', () => {
    expect(resolveResumeStage({
      poReceiptId: 9001,
      priorError: 'CreatePoReceiptsLabelsPlan failed: boom',
    })).toBe('fromLabels');
  });

  it('returns "fromLabels" as the safe default when the receipt exists but the error is unknown', () => {
    expect(resolveResumeStage({ poReceiptId: 9001, priorError: '' })).toBe('fromLabels');
    expect(resolveResumeStage({ poReceiptId: 9001 })).toBe('fromLabels');
  });
});
