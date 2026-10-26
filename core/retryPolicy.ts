export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableCodes: readonly string[];
}

export interface RetryDecision {
  retry: boolean;
  nextAttempt: number;
  delayMs: number;
  reason: string;
}

export function decideRetry(input: {
  attempt: number;
  errorCode: string;
  cancelled?: boolean;
  policy?: Partial<RetryPolicy>;
}): RetryDecision {
  const policy: RetryPolicy = {
    maxAttempts: input.policy?.maxAttempts ?? 3,
    baseDelayMs: input.policy?.baseDelayMs ?? 500,
    maxDelayMs: input.policy?.maxDelayMs ?? 8000,
    retryableCodes: input.policy?.retryableCodes ?? ["RATE_LIMITED", "TIMEOUT", "TEMPORARY_UNAVAILABLE", "NETWORK_ERROR"]
  };
  if (input.cancelled) return { retry: false, nextAttempt: input.attempt, delayMs: 0, reason: "Task was cancelled" };
  if (input.attempt >= policy.maxAttempts) return { retry: false, nextAttempt: input.attempt, delayMs: 0, reason: "Retry limit reached" };
  if (!policy.retryableCodes.includes(input.errorCode)) return { retry: false, nextAttempt: input.attempt, delayMs: 0, reason: "Error is not marked retryable" };
  const exponent = Math.max(0, input.attempt - 1);
  const delayMs = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** exponent);
  return { retry: true, nextAttempt: input.attempt + 1, delayMs, reason: "Temporary error may recover" };
}
