import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateBusinessStartDateDisqualification,
  evaluateChatDisqualification,
  TIME_IN_BUSINESS_DISQUALIFICATION_REASONS,
} from '../src/services/disqualification.service';

test('chat disqualification detects no revenue and pre-revenue startup statements', () => {
  assert.equal(evaluateChatDisqualification('we have no revenue yet')?.code, 'no_revenue');
  assert.equal(evaluateChatDisqualification('I am a startup in pre-revenue')?.code, 'startup_or_pre_revenue');
});

test('chat disqualification detects less than one month in business', () => {
  assert.equal(evaluateChatDisqualification('time in business is 0 months')?.code, 'insufficient_time_in_business');
  assert.equal(evaluateChatDisqualification('we have been open under one month')?.code, 'insufficient_time_in_business');
});

test('business start date must be at least one month old', () => {
  const now = new Date(2026, 4, 30);
  assert.equal(evaluateBusinessStartDateDisqualification('2026-05-01', now)?.code, 'insufficient_time_in_business');
  assert.equal(evaluateBusinessStartDateDisqualification('2026-04-30', now), null);
});

test('time-in-business reasons used by evaluators are clearable on requalification', () => {
  const now = new Date(2026, 4, 30);
  const startDateReason = evaluateBusinessStartDateDisqualification('2026-05-01', now)?.reason;
  const chatReason = evaluateChatDisqualification('time in business is 0 months')?.reason;
  assert.ok(startDateReason && TIME_IN_BUSINESS_DISQUALIFICATION_REASONS.includes(startDateReason));
  assert.ok(chatReason && TIME_IN_BUSINESS_DISQUALIFICATION_REASONS.includes(chatReason));
});