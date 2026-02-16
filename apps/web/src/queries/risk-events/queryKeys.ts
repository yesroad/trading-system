const riskEventsKeys = {
  all: ['risk-events'] as const,
  bySeverity: (severity?: 'low' | 'medium' | 'high' | 'critical', hours?: number) =>
    [...riskEventsKeys.all, { severity, hours }] as const,
};

export default riskEventsKeys;
