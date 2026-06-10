const BPS = 10_000n;
const ONE_1E18 = 1_000_000_000_000_000_000n;
const MONEY_SCALE = 1_000_000n;

export const defaultSimulationConfig = {
  seed: 42,
  periods: 12,
  secondsPerPeriod: 86_400,
  portfolio: {
    policyCount: 120,
    principalPerPolicy: 100_000,
    exposurePerPolicy: 250_000,
    initialReserve: 200_000,
    coverageCapBps: 7_500,
    eligibilityThresholdPct: 80,
    inRange: {
      distribution: "beta",
      alpha: 9,
      beta: 2,
    },
  },
  frequency: {
    distribution: "poisson",
    lambda: 3.2,
  },
  severity: {
    distribution: "lognormal",
    medianBps: 1_250,
    sigma: 0.55,
    minBps: 50,
    maxBps: 8_000,
    directionWeights: {
      up: 0.5,
      down: 0.5,
    },
  },
  claims: {
    cooldownPeriods: 1,
    maxExecutionAttempts: 3,
  },
  premiumRules: {
    pricingModel: "exposure_bps",
    basePremiumBps: 2,
    minimumPremiumPerPolicy: 20,
    expectedLossRatioBps: 4,
    actuarialLoadFactorBps: 11_500,
    rounding: "floor",
  },
  reactiveContract: {
    enabled: true,
    earlyWarnBps: 300,
    slopeWarnBps: 200,
    alertLevelHigh: 2,
    alertLevelTrend: 1,
    alertTtlPeriods: 2,
    reserveLowThreshold: 100_000,
    tightenThresholdValue: 25_000,
    premiumRateWhenImbalanced: 6,
    callbackSuccessProbability: 1,
    epochCheckpointEveryPeriods: 1,
  },
  logging: {
    maxEvents: 2_000,
    echoEvents: false,
    includeEventData: true,
  },
  validation: {
    maxPremiumCalculationErrorBps: 0,
    minReactiveActivationSuccessRate: 0.95,
  },
};

export function runInsuranceSimulation(userConfig = {}) {
  const config = mergeConfig(defaultSimulationConfig, userConfig);
  validateConfig(config);

  const rng = createSeededRng(config.seed);
  const state = createInitialState(config);

  for (let period = 1; period <= config.periods; period += 1) {
    if (state.alertExpiresAtPeriod !== 0 && period > state.alertExpiresAtPeriod) {
      state.alertLevel = 0;
    }

    collectPremiums(config, state, period);
    generateLossEvents(config, state, period, rng);
    executePendingClaims(config, state, period, rng);
    maybeCheckpointEpoch(config, state, period);
  }

  finalizePendingClaims(config, state);
  const report = buildSimulationReport(config, state);
  report.validation = runValidationSuite(config, report);
  return report;
}

export function formatSimulationReport(report) {
  const lines = [];
  lines.push("# Goldgard Insurance Simulation Report");
  lines.push("");
  lines.push("## Scenario");
  lines.push("");
  lines.push(`- seed: ${report.config.seed}`);
  lines.push(`- periods: ${report.config.periods}`);
  lines.push(`- policies: ${report.config.portfolio.policyCount}`);
  lines.push(`- principalPerPolicy: ${formatMoney(report.config.portfolio.principalPerPolicyUnits)}`);
  lines.push(`- initialReserve: ${formatMoney(report.config.portfolio.initialReserveUnits)}`);
  lines.push(`- basePremiumBps: ${report.config.premiumRules.basePremiumBps}`);
  lines.push(
    `- frequency: ${report.config.frequency.distribution} (${describeFrequency(report.config.frequency)})`,
  );
  lines.push(
    `- severity: ${report.config.severity.distribution} (${describeSeverity(report.config.severity)})`,
  );
  lines.push("");
  lines.push("## Financial Metrics");
  lines.push("");
  lines.push(`- premiumCollected: ${formatMoney(report.metrics.premiumCollectedUnits)}`);
  lines.push(`- actuarialBenchmarkPremium: ${formatMoney(report.metrics.actuarialBenchmarkPremiumUnits)}`);
  lines.push(`- reactivePremiumUplift: ${formatMoney(report.metrics.reactivePremiumUpliftUnits)}`);
  lines.push(`- grossLoss: ${formatMoney(report.metrics.grossLossUnits)}`);
  lines.push(`- requestedPayout: ${formatMoney(report.metrics.requestedPayoutUnits)}`);
  lines.push(`- paidPayout: ${formatMoney(report.metrics.paidPayoutUnits)}`);
  lines.push(`- endingReserve: ${formatMoney(report.metrics.endingReserveUnits)}`);
  lines.push(`- lossCoverageRatio: ${formatPct(report.metrics.lossCoverageRatio)}`);
  lines.push(`- requestedCoverageRatio: ${formatPct(report.metrics.requestedCoverageRatio)}`);
  lines.push(`- premiumAdequacyRatio: ${formatPct(report.metrics.premiumAdequacyRatio)}`);
  lines.push(`- premiumCalculationAccuracy: ${formatPct(report.metrics.premiumCalculationAccuracy)}`);
  lines.push("");
  lines.push("## Reactive Metrics");
  lines.push("");
  lines.push(`- oracleTriggersExpected: ${report.reactive.oracle.expected}`);
  lines.push(`- oracleTriggersSucceeded: ${report.reactive.oracle.succeeded}`);
  lines.push(`- reserveTriggersExpected: ${report.reactive.reserve.expected}`);
  lines.push(`- reserveTriggersSucceeded: ${report.reactive.reserve.succeeded}`);
  lines.push(`- claimTriggersExpected: ${report.reactive.claim.expected}`);
  lines.push(`- claimTriggersSucceeded: ${report.reactive.claim.succeeded}`);
  lines.push(
    `- activationSuccessRate: ${formatPct(report.metrics.reactiveActivationSuccessRate)}`,
  );
  lines.push(`- premiumRateChanges: ${report.reactive.operationalOutcomes.premiumRateChanges}`);
  lines.push(`- thresholdTightenings: ${report.reactive.operationalOutcomes.thresholdTightenings}`);
  lines.push(`- alertedPeriods: ${report.reactive.operationalOutcomes.alertedPeriods}`);
  lines.push("");
  lines.push("## Claims");
  lines.push("");
  lines.push(`- generatedLossEvents: ${report.claims.generatedLossEvents}`);
  lines.push(`- claimRequests: ${report.claims.requested}`);
  lines.push(`- claimsPaid: ${report.claims.paid}`);
  lines.push(`- claimsRejectedIneligible: ${report.claims.rejectedIneligible}`);
  lines.push(`- claimsFailedZeroPayout: ${report.claims.failedZeroPayout}`);
  lines.push(`- pendingClaims: ${report.claims.pending}`);
  lines.push(`- claimPaymentRate: ${formatPct(report.metrics.claimPaymentRate)}`);
  lines.push("");
  lines.push("## Validation");
  lines.push("");
  for (const check of report.validation.checks) {
    const status = check.pass ? "PASS" : "FAIL";
    lines.push(`- ${status}: ${check.name} (${check.detail})`);
  }
  if (report.eventsSample.length > 0) {
    lines.push("");
    lines.push("## Event Sample");
    lines.push("");
    for (const entry of report.eventsSample) {
      lines.push(`- [P${entry.period}] ${entry.type}: ${entry.summary}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function runValidationSuite(config, report) {
  const ratio = ONE_1E18 * 3n;
  const inverseRatio = ONE_1E18 / 3n;
  const ilForward = ilBpsFromRatio1e18(ratio);
  const ilInverse = ilBpsFromRatio1e18(inverseRatio);
  const cappedPayout = computeRequestedPayoutUnits({
    principalUnits: toMoneyUnits(100_000),
    priceRatio1e18: priceRatioFromMoveBps(9_000, "up"),
    coverageCapBps: 100,
  });
  const reserveBasePayout = computeRequestedPayoutUnits({
    principalUnits: toMoneyUnits(100_000),
    priceRatio1e18: priceRatioFromMoveBps(9_000, "up"),
    coverageCapBps: 1_000,
  });
  const reserveLimitedPayout = minBigInt(reserveBasePayout, toMoneyUnits(1_500));
  const premiumCheckErrorBps = report.metrics.premiumCalculationErrorBps;
  const activationRate = report.metrics.reactiveActivationSuccessRate;

  const checks = [
    {
      name: "IL symmetry",
      pass: diffBigInt(ilForward, ilInverse) <= 1n,
      detail: `forward=${ilForward}bps inverse=${ilInverse}bps`,
    },
    {
      name: "Coverage cap enforcement",
      pass: cappedPayout === toMoneyUnits(1_000),
      detail: `cappedPayout=${formatMoney(cappedPayout)}`,
    },
    {
      name: "Reserve cap enforcement",
      pass: reserveLimitedPayout === toMoneyUnits(1_500),
      detail: `reserveLimitedPayout=${formatMoney(reserveLimitedPayout)}`,
    },
    {
      name: "Premium rule accuracy",
      pass: premiumCheckErrorBps <= Number(config.validation.maxPremiumCalculationErrorBps ?? 0),
      detail: `error=${premiumCheckErrorBps.toFixed(4)}bps`,
    },
    {
      name: "Reactive activation success rate",
      pass: activationRate >= Number(config.validation.minReactiveActivationSuccessRate ?? 0),
      detail: `rate=${formatPct(activationRate)}`,
    },
  ];

  return {
    pass: checks.every((check) => check.pass),
    checks,
  };
}

export function ilBpsFromRatio1e18(ratio1e18) {
  if (ratio1e18 <= 0n) return 0n;
  const sqrtR1e18 = sqrtBigInt(ratio1e18 * ONE_1E18);
  const factor1e18 = mulDiv(2n * sqrtR1e18, ONE_1E18, ONE_1E18 + ratio1e18);
  if (factor1e18 >= ONE_1E18) return 0n;
  return mulDiv(ONE_1E18 - factor1e18, BPS, ONE_1E18);
}

export function priceRatioFromMoveBps(moveBps, direction) {
  const bounded = clampNumber(Math.round(Number(moveBps)), 0, 9_999);
  const numerator = direction === "down" ? 10_000 - bounded : 10_000 + bounded;
  return (BigInt(numerator) * ONE_1E18) / 10_000n;
}

export function computeRequestedPayoutUnits({
  principalUnits,
  priceRatio1e18,
  coverageCapBps,
}) {
  const ilBps = ilBpsFromRatio1e18(priceRatio1e18);
  const cappedIlBps = minBigInt(ilBps, BigInt(coverageCapBps));
  return mulDiv(principalUnits, cappedIlBps, BPS);
}

export function calculatePremiumForPolicy(config, currentPremiumBps, principalUnits, exposureUnits) {
  const rules = config.premiumRules;
  const exposureBased = divideWithRounding(
    exposureUnits * BigInt(currentPremiumBps),
    BPS,
    rules.rounding,
  );
  const expectedLoss = divideWithRounding(
    principalUnits * BigInt(rules.expectedLossRatioBps),
    BPS,
    rules.rounding,
  );
  const actuarialLoaded = divideWithRounding(
    expectedLoss * BigInt(rules.actuarialLoadFactorBps),
    BPS,
    rules.rounding,
  );

  let selected;
  switch (rules.pricingModel) {
    case "exposure_bps":
      selected = exposureBased;
      break;
    case "expected_loss_loaded":
      selected = actuarialLoaded;
      break;
    case "max_of_both":
      selected = maxBigInt(exposureBased, actuarialLoaded);
      break;
    default:
      throw new Error(`Unsupported pricingModel: ${rules.pricingModel}`);
  }

  const minimum = toMoneyUnits(rules.minimumPremiumPerPolicy);
  const actual = maxBigInt(selected, minimum);
  const benchmark = maxBigInt(actuarialLoaded, minimum);

  return {
    actual,
    benchmark,
    exposureBased,
    actuarialLoaded,
  };
}

function createInitialState(config) {
  return {
    reserveUnits: toMoneyUnits(config.portfolio.initialReserve),
    currentPremiumBps: config.premiumRules.basePremiumBps,
    basePremiumBps: config.premiumRules.basePremiumBps,
    minRebalanceThresholdUnits: 0n,
    alertLevel: 0,
    alertExpiresAtPeriod: 0,
    lastDeviationBps: 0,
    lastTimestamp: 0,
    lastSlopeBpsPerSecond: 0,
    epochId: 0,
    nextClaimId: 1,
    pendingClaims: [],
    events: [],
    metrics: {
      premiumCollectedUnits: 0n,
      baseScenarioPremiumUnits: 0n,
      actuarialBenchmarkPremiumUnits: 0n,
      grossLossUnits: 0n,
      requestedPayoutUnits: 0n,
      paidPayoutUnits: 0n,
      claimRequests: 0,
      claimsPaid: 0,
      claimsRejectedIneligible: 0,
      claimsFailedZeroPayout: 0,
      generatedLossEvents: 0,
      premiumCalculationErrorUnits: 0n,
      alertedPeriods: new Set(),
    },
    reactive: {
      oracle: { expected: 0, succeeded: 0, failed: 0 },
      reserve: { expected: 0, succeeded: 0, failed: 0 },
      claim: { expected: 0, succeeded: 0, failed: 0 },
      operationalOutcomes: {
        premiumRateChanges: 0,
        thresholdTightenings: 0,
      },
    },
  };
}

function collectPremiums(config, state, period) {
  const policyCount = Number(config.portfolio.policyCount);
  const principalUnits = toMoneyUnits(config.portfolio.principalPerPolicy);
  const exposureUnits = toMoneyUnits(config.portfolio.exposurePerPolicy);

  let premiumUnits = 0n;
  let baseScenarioPremiumUnits = 0n;
  let benchmarkUnits = 0n;
  let calcErrorUnits = 0n;

  for (let i = 0; i < policyCount; i += 1) {
    const actual = calculatePremiumForPolicy(
      config,
      state.currentPremiumBps,
      principalUnits,
      exposureUnits,
    );
    const baseScenario = calculatePremiumForPolicy(
      config,
      state.basePremiumBps,
      principalUnits,
      exposureUnits,
    );
    premiumUnits += actual.actual;
    baseScenarioPremiumUnits += baseScenario.actual;
    benchmarkUnits += actual.benchmark;
    calcErrorUnits += diffBigInt(actual.actual, recomputeExpectedPremium(config, actual, state.currentPremiumBps));
  }

  state.reserveUnits += premiumUnits;
  state.metrics.premiumCollectedUnits += premiumUnits;
  state.metrics.baseScenarioPremiumUnits += baseScenarioPremiumUnits;
  state.metrics.actuarialBenchmarkPremiumUnits += benchmarkUnits;
  state.metrics.premiumCalculationErrorUnits += calcErrorUnits;

  logEvent(config, state, {
    period,
    type: "premium_collected",
    summary: `collected ${formatMoney(premiumUnits)} at ${state.currentPremiumBps} bps`,
    premiumUnits,
    currentPremiumBps: state.currentPremiumBps,
    reserveUnits: state.reserveUnits,
  });
}

function generateLossEvents(config, state, period, rng) {
  const count = sampleFrequencyCount(config.frequency, rng);
  const principalUnits = toMoneyUnits(config.portfolio.principalPerPolicy);
  const cooldownPeriods = Number(config.claims.cooldownPeriods);

  for (let i = 0; i < count; i += 1) {
    const severityBps = sampleSeverityBps(config.severity, rng);
    const direction = sampleDirection(config.severity.directionWeights, rng);
    const priceRatio1e18 = priceRatioFromMoveBps(severityBps, direction);
    const rawIlBps = ilBpsFromRatio1e18(priceRatio1e18);
    const requestedPayoutUnits = computeRequestedPayoutUnits({
      principalUnits,
      priceRatio1e18,
      coverageCapBps: config.portfolio.coverageCapBps,
    });
    const grossLossUnits = mulDiv(principalUnits, rawIlBps, BPS);
    const inRangeRatio = sampleEligibilityRatio(config.portfolio.inRange, rng);
    const eligible =
      Math.round(inRangeRatio * 100) >= Number(config.portfolio.eligibilityThresholdPct);
    const timestamp =
      (period - 1) * Number(config.secondsPerPeriod) +
      Math.floor(((i + 1) * Number(config.secondsPerPeriod)) / (count + 1));

    state.metrics.generatedLossEvents += 1;
    state.metrics.grossLossUnits += grossLossUnits;
    state.metrics.requestedPayoutUnits += requestedPayoutUnits;
    state.metrics.claimRequests += 1;

    evaluateOracleTrigger(config, state, period, severityBps, timestamp, rng);

    const claim = {
      id: state.nextClaimId,
      periodRequested: period,
      eligible,
      inRangeRatio,
      direction,
      severityBps,
      priceRatio1e18,
      rawIlBps,
      grossLossUnits,
      requestedPayoutUnits,
      executableFromPeriod: period + cooldownPeriods,
      attempts: 0,
      status: "pending",
    };
    state.nextClaimId += 1;
    state.pendingClaims.push(claim);

    logEvent(config, state, {
      period,
      type: "il_event_generated",
      summary: `claim ${claim.id} severity ${severityBps}bps ${direction}, requested ${formatMoney(requestedPayoutUnits)}`,
      claimId: claim.id,
      severityBps,
      direction,
      inRangeRatio,
      eligible,
      grossLossUnits,
      requestedPayoutUnits,
      executableFromPeriod: claim.executableFromPeriod,
    });
  }
}

function executePendingClaims(config, state, period, rng) {
  const survivors = [];
  for (const claim of state.pendingClaims) {
    if (claim.status !== "pending") continue;
    if (period < claim.executableFromPeriod) {
      survivors.push(claim);
      continue;
    }

    claim.attempts += 1;
    if (!claim.eligible) {
      claim.status = "rejected_ineligible";
      state.metrics.claimsRejectedIneligible += 1;
      logEvent(config, state, {
        period,
        type: "claim_rejected",
        summary: `claim ${claim.id} rejected for eligibility`,
        claimId: claim.id,
        reason: "not_eligible",
      });
      continue;
    }

    const payoutUnits = minBigInt(claim.requestedPayoutUnits, state.reserveUnits);
    if (payoutUnits === 0n) {
      if (claim.attempts >= Number(config.claims.maxExecutionAttempts)) {
        claim.status = "failed_zero_payout";
        state.metrics.claimsFailedZeroPayout += 1;
        logEvent(config, state, {
          period,
          type: "claim_failed",
          summary: `claim ${claim.id} exhausted payout attempts`,
          claimId: claim.id,
          reason: "zero_payout",
          attempts: claim.attempts,
        });
        continue;
      }

      survivors.push(claim);
      logEvent(config, state, {
        period,
        type: "claim_deferred",
        summary: `claim ${claim.id} deferred because reserve is empty`,
        claimId: claim.id,
        attempts: claim.attempts,
      });
      continue;
    }

    claim.status = "paid";
    state.reserveUnits -= payoutUnits;
    state.metrics.paidPayoutUnits += payoutUnits;
    state.metrics.claimsPaid += 1;

    logEvent(config, state, {
      period,
      type: "claim_paid",
      summary: `claim ${claim.id} paid ${formatMoney(payoutUnits)}`,
      claimId: claim.id,
      payoutUnits,
      reserveUnits: state.reserveUnits,
    });

    evaluateClaimTrigger(config, state, period, payoutUnits, rng);
    evaluateReserveTrigger(config, state, period, rng);
  }

  state.pendingClaims = survivors;
}

function maybeCheckpointEpoch(config, state, period) {
  const cadence = Number(config.reactiveContract.epochCheckpointEveryPeriods ?? 0);
  if (cadence <= 0 || period % cadence !== 0) return;

  logEvent(config, state, {
    period,
    type: "epoch_checkpoint",
    summary: `epoch ${state.epochId} checkpointed`,
    epochId: state.epochId,
    reserveUnits: state.reserveUnits,
  });
  state.epochId += 1;
}

function finalizePendingClaims(config, state) {
  for (const claim of state.pendingClaims) {
    logEvent(config, state, {
      period: claim.executableFromPeriod,
      type: "claim_pending",
      summary: `claim ${claim.id} remains pending after simulation horizon`,
      claimId: claim.id,
      attempts: claim.attempts,
    });
  }
}

function buildSimulationReport(config, state) {
  const reactiveExpected =
    state.reactive.oracle.expected +
    state.reactive.reserve.expected +
    state.reactive.claim.expected;
  const reactiveSucceeded =
    state.reactive.oracle.succeeded +
    state.reactive.reserve.succeeded +
    state.reactive.claim.succeeded;
  const premiumCalcBase = state.metrics.premiumCollectedUnits === 0n ? 1n : state.metrics.premiumCollectedUnits;

  const report = {
    config: enrichConfigForReport(config),
    metrics: {
      premiumCollectedUnits: state.metrics.premiumCollectedUnits.toString(),
      actuarialBenchmarkPremiumUnits: state.metrics.actuarialBenchmarkPremiumUnits.toString(),
      reactivePremiumUpliftUnits: (
        state.metrics.premiumCollectedUnits - state.metrics.baseScenarioPremiumUnits
      ).toString(),
      grossLossUnits: state.metrics.grossLossUnits.toString(),
      requestedPayoutUnits: state.metrics.requestedPayoutUnits.toString(),
      paidPayoutUnits: state.metrics.paidPayoutUnits.toString(),
      endingReserveUnits: state.reserveUnits.toString(),
      lossCoverageRatio: ratioNumber(state.metrics.paidPayoutUnits, state.metrics.grossLossUnits),
      requestedCoverageRatio: ratioNumber(
        state.metrics.paidPayoutUnits,
        state.metrics.requestedPayoutUnits,
      ),
      premiumAdequacyRatio: ratioNumber(
        state.metrics.premiumCollectedUnits,
        state.metrics.actuarialBenchmarkPremiumUnits,
      ),
      claimPaymentRate: ratioNumber(
        BigInt(state.metrics.claimsPaid),
        BigInt(state.metrics.claimRequests),
      ),
      reactiveActivationSuccessRate:
        reactiveExpected === 0 ? 1 : reactiveSucceeded / reactiveExpected,
      premiumCalculationAccuracy:
        state.metrics.premiumCollectedUnits === 0n
          ? 1
          : Math.max(
              0,
              1 -
                Number(state.metrics.premiumCalculationErrorUnits) /
                  Number(premiumCalcBase),
            ),
      premiumCalculationErrorBps:
        Number(state.metrics.premiumCalculationErrorUnits * BPS) / Number(premiumCalcBase),
    },
    claims: {
      generatedLossEvents: state.metrics.generatedLossEvents,
      requested: state.metrics.claimRequests,
      paid: state.metrics.claimsPaid,
      rejectedIneligible: state.metrics.claimsRejectedIneligible,
      failedZeroPayout: state.metrics.claimsFailedZeroPayout,
      pending: state.pendingClaims.length,
    },
    reactive: {
      oracle: state.reactive.oracle,
      reserve: state.reactive.reserve,
      claim: state.reactive.claim,
      operationalOutcomes: {
        premiumRateChanges: state.reactive.operationalOutcomes.premiumRateChanges,
        thresholdTightenings: state.reactive.operationalOutcomes.thresholdTightenings,
        alertedPeriods: state.metrics.alertedPeriods.size,
        finalAlertLevel: state.alertLevel,
        finalPremiumBps: state.currentPremiumBps,
        minRebalanceThresholdUnits: state.minRebalanceThresholdUnits.toString(),
      },
    },
    eventsLogged: state.events.length,
    eventsSample: state.events.slice(0, 25).map((entry) => ({
      period: entry.period,
      type: entry.type,
      summary: entry.summary,
    })),
    events: state.events.map((entry) => normalizeBigInts(entry)),
  };

  report.metrics.premiumCollectedUnits = toMoneyValue(report.metrics.premiumCollectedUnits);
  report.metrics.actuarialBenchmarkPremiumUnits = toMoneyValue(
    report.metrics.actuarialBenchmarkPremiumUnits,
  );
  report.metrics.reactivePremiumUpliftUnits = toMoneyValue(
    report.metrics.reactivePremiumUpliftUnits,
  );
  report.metrics.grossLossUnits = toMoneyValue(report.metrics.grossLossUnits);
  report.metrics.requestedPayoutUnits = toMoneyValue(report.metrics.requestedPayoutUnits);
  report.metrics.paidPayoutUnits = toMoneyValue(report.metrics.paidPayoutUnits);
  report.metrics.endingReserveUnits = toMoneyValue(report.metrics.endingReserveUnits);
  report.reactive.operationalOutcomes.minRebalanceThresholdUnits = toMoneyValue(
    report.reactive.operationalOutcomes.minRebalanceThresholdUnits,
  );

  return report;
}

function enrichConfigForReport(config) {
  const enriched = structuredCloneCompat(config);
  enriched.portfolio.principalPerPolicyUnits = toMoneyValue(toMoneyUnits(config.portfolio.principalPerPolicy));
  enriched.portfolio.initialReserveUnits = toMoneyValue(toMoneyUnits(config.portfolio.initialReserve));
  return enriched;
}

function evaluateOracleTrigger(config, state, period, deviationBps, timestamp, rng) {
  if (!config.reactiveContract.enabled) return;

  let slope = 0;
  if (state.lastTimestamp !== 0 && timestamp > state.lastTimestamp) {
    const dt = timestamp - state.lastTimestamp;
    if (deviationBps > state.lastDeviationBps && dt > 0) {
      slope = (deviationBps - state.lastDeviationBps) / dt;
    }
  }

  state.lastTimestamp = timestamp;
  state.lastDeviationBps = deviationBps;
  state.lastSlopeBpsPerSecond = slope;

  let level = 0;
  if (deviationBps >= Number(config.reactiveContract.earlyWarnBps)) {
    level = Number(config.reactiveContract.alertLevelHigh);
  } else if (
    deviationBps >= Number(config.reactiveContract.slopeWarnBps) &&
    slope !== 0
  ) {
    level = Number(config.reactiveContract.alertLevelTrend);
  }

  if (level === 0) return;

  attemptReactiveAction(config, state, "oracle", period, rng, () => {
    state.alertLevel = level;
    state.alertExpiresAtPeriod = period + Number(config.reactiveContract.alertTtlPeriods);
    state.metrics.alertedPeriods.add(period);
  }, {
    type: "reactive_alert_triggered",
    summary: `oracle deviation ${deviationBps}bps raised level ${level}`,
    deviationBps,
    slopeBpsPerSecond: slope,
    alertLevel: level,
  });
}

function evaluateClaimTrigger(config, state, period, payoutUnits, rng) {
  if (!config.reactiveContract.enabled) return;
  if (payoutUnits === 0n) return;
  const newRateBps = Number(config.reactiveContract.premiumRateWhenImbalanced ?? 0);
  if (newRateBps === 0) return;

  attemptReactiveAction(config, state, "claim", period, rng, () => {
    state.currentPremiumBps = newRateBps;
    state.reactive.operationalOutcomes.premiumRateChanges += 1;
  }, {
    type: "reactive_premium_adjusted",
    summary: `claim payout adjusted premium rate to ${newRateBps}bps`,
    payoutUnits,
    newRateBps,
  });
}

function evaluateReserveTrigger(config, state, period, rng) {
  if (!config.reactiveContract.enabled) return;
  const reserveLowThresholdUnits = toMoneyUnits(config.reactiveContract.reserveLowThreshold ?? 0);
  if (reserveLowThresholdUnits === 0n) return;
  if (state.reserveUnits >= reserveLowThresholdUnits) return;

  const tightenThresholdUnits = toMoneyUnits(config.reactiveContract.tightenThresholdValue ?? 0);
  if (tightenThresholdUnits === 0n) return;

  attemptReactiveAction(config, state, "reserve", period, rng, () => {
    state.minRebalanceThresholdUnits = tightenThresholdUnits;
    state.reactive.operationalOutcomes.thresholdTightenings += 1;
  }, {
    type: "reactive_threshold_tightened",
    summary: `reserve ${formatMoney(state.reserveUnits)} tightened threshold to ${formatMoney(tightenThresholdUnits)}`,
    reserveUnits: state.reserveUnits,
    thresholdUnits: tightenThresholdUnits,
  });
}

function attemptReactiveAction(config, state, bucket, period, rng, onSuccess, entry) {
  state.reactive[bucket].expected += 1;
  const probability = Number(config.reactiveContract.callbackSuccessProbability ?? 1);
  const succeeded = rng() <= probability;

  if (succeeded) {
    state.reactive[bucket].succeeded += 1;
    onSuccess();
  } else {
    state.reactive[bucket].failed += 1;
  }

  logEvent(config, state, {
    period,
    callbackSucceeded: succeeded,
    ...entry,
  });
}

function logEvent(config, state, entry) {
  if (state.events.length >= Number(config.logging.maxEvents)) return;
  const payload = config.logging.includeEventData ? entry : pickSummaryFields(entry);
  state.events.push(payload);
  if (config.logging.echoEvents) {
    // Keep console logging opt-in because large stochastic runs can be noisy.
    console.log(`[P${entry.period}] ${entry.type} - ${entry.summary}`);
  }
}

function sampleFrequencyCount(frequency, rng) {
  switch (frequency.distribution) {
    case "fixed":
      return Math.max(0, Math.round(Number(frequency.count)));
    case "poisson":
      return samplePoisson(Number(frequency.lambda), rng);
    case "binomial":
      return sampleBinomial(Number(frequency.trials), Number(frequency.probability), rng);
    case "negative_binomial":
      return sampleNegativeBinomial(
        Number(frequency.targetSuccesses),
        Number(frequency.successProbability),
        rng,
      );
    default:
      throw new Error(`Unsupported frequency distribution: ${frequency.distribution}`);
  }
}

function sampleSeverityBps(severity, rng) {
  let raw;
  switch (severity.distribution) {
    case "fixed":
      raw = Number(severity.valueBps);
      break;
    case "uniform":
      raw = sampleUniform(Number(severity.minBps), Number(severity.maxBps), rng);
      break;
    case "discrete":
      raw = sampleDiscrete(severity.points, rng);
      break;
    case "pareto":
      raw = samplePareto(Number(severity.scaleBps), Number(severity.alpha), rng);
      break;
    case "lognormal":
      raw = sampleLogNormal(Number(severity.medianBps), Number(severity.sigma), rng);
      break;
    default:
      throw new Error(`Unsupported severity distribution: ${severity.distribution}`);
  }

  const minBps = Number(severity.minBps ?? 0);
  const maxBps = Number(severity.maxBps ?? 9_999);
  return clampNumber(Math.round(raw), minBps, maxBps);
}

function sampleDirection(directionWeights, rng) {
  const up = Number(directionWeights?.up ?? 0.5);
  const down = Number(directionWeights?.down ?? 0.5);
  const total = up + down;
  const pick = rng() * total;
  return pick < up ? "up" : "down";
}

function sampleEligibilityRatio(inRange, rng) {
  switch (inRange.distribution) {
    case "fixed":
      return clampNumber(Number(inRange.value), 0, 1);
    case "uniform":
      return clampNumber(sampleUniform(Number(inRange.min), Number(inRange.max), rng), 0, 1);
    case "beta":
      return clampNumber(sampleBeta(Number(inRange.alpha), Number(inRange.beta), rng), 0, 1);
    default:
      throw new Error(`Unsupported inRange distribution: ${inRange.distribution}`);
  }
}

function recomputeExpectedPremium(config, premiumResult) {
  const minimum = toMoneyUnits(config.premiumRules.minimumPremiumPerPolicy);
  switch (config.premiumRules.pricingModel) {
    case "exposure_bps":
      return maxBigInt(premiumResult.exposureBased, minimum);
    case "expected_loss_loaded":
      return maxBigInt(premiumResult.actuarialLoaded, minimum);
    case "max_of_both":
      return maxBigInt(maxBigInt(premiumResult.exposureBased, premiumResult.actuarialLoaded), minimum);
    default:
      throw new Error(`Unsupported pricingModel: ${config.premiumRules.pricingModel}`);
  }
}

function validateConfig(config) {
  const errors = [];
  if (config.periods <= 0) errors.push("periods must be positive");
  if (config.portfolio.policyCount <= 0) errors.push("portfolio.policyCount must be positive");
  if (config.portfolio.coverageCapBps < 0 || config.portfolio.coverageCapBps > 10_000) {
    errors.push("portfolio.coverageCapBps must be in [0, 10000]");
  }
  if (config.premiumRules.basePremiumBps < 0 || config.premiumRules.basePremiumBps > 100) {
    errors.push("premiumRules.basePremiumBps must be in [0, 100]");
  }
  if (
    config.reactiveContract.premiumRateWhenImbalanced < 0 ||
    config.reactiveContract.premiumRateWhenImbalanced > 100
  ) {
    errors.push("reactiveContract.premiumRateWhenImbalanced must be in [0, 100]");
  }
  if (
    config.reactiveContract.callbackSuccessProbability < 0 ||
    config.reactiveContract.callbackSuccessProbability > 1
  ) {
    errors.push("reactiveContract.callbackSuccessProbability must be in [0, 1]");
  }
  if (errors.length > 0) {
    throw new Error(`Invalid simulation config:\n- ${errors.join("\n- ")}`);
  }
}

function mergeConfig(base, override) {
  if (override == null || typeof override !== "object" || Array.isArray(override)) return structuredCloneCompat(base);
  const result = structuredCloneCompat(base);
  for (const [key, value] of Object.entries(override)) {
    if (value == null) {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === "object" ? structuredCloneCompat(item) : item,
      );
    } else if (typeof value === "object") {
      result[key] = mergeConfig(result[key] ?? {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function structuredCloneCompat(value) {
  return JSON.parse(JSON.stringify(value));
}

function toMoneyUnits(value) {
  return BigInt(Math.round(Number(value) * Number(MONEY_SCALE)));
}

function toMoneyValue(value) {
  return Number(value) / Number(MONEY_SCALE);
}

function formatMoney(value) {
  const n = typeof value === "number" ? value : Number(value) / Number(MONEY_SCALE);
  return `${n.toFixed(2)}`;
}

function formatPct(value) {
  return `${(Number(value) * 100).toFixed(2)}%`;
}

function describeFrequency(frequency) {
  switch (frequency.distribution) {
    case "fixed":
      return `count=${frequency.count}`;
    case "poisson":
      return `lambda=${frequency.lambda}`;
    case "binomial":
      return `trials=${frequency.trials}, p=${frequency.probability}`;
    case "negative_binomial":
      return `r=${frequency.targetSuccesses}, p=${frequency.successProbability}`;
    default:
      return "custom";
  }
}

function describeSeverity(severity) {
  switch (severity.distribution) {
    case "fixed":
      return `value=${severity.valueBps}bps`;
    case "uniform":
      return `min=${severity.minBps}bps, max=${severity.maxBps}bps`;
    case "pareto":
      return `scale=${severity.scaleBps}bps, alpha=${severity.alpha}`;
    case "lognormal":
      return `median=${severity.medianBps}bps, sigma=${severity.sigma}`;
    case "discrete":
      return `${severity.points.length} points`;
    default:
      return "custom";
  }
}

function normalizeBigInts(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => normalizeBigInts(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeBigInts(item)]),
    );
  }
  return value;
}

function pickSummaryFields(entry) {
  return {
    period: entry.period,
    type: entry.type,
    summary: entry.summary,
    callbackSucceeded: entry.callbackSucceeded,
  };
}

function createSeededRng(seed) {
  let state = normalizeSeed(seed);
  return function rng() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeSeed(seed) {
  if (typeof seed === "number") return seed >>> 0;
  const s = String(seed);
  let out = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    out ^= s.charCodeAt(i);
    out = Math.imul(out, 16777619);
  }
  return out >>> 0;
}

function samplePoisson(lambda, rng) {
  const limit = Math.exp(-Math.max(0, lambda));
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

function sampleBinomial(trials, probability, rng) {
  let successes = 0;
  for (let i = 0; i < trials; i += 1) {
    if (rng() <= probability) successes += 1;
  }
  return successes;
}

function sampleNegativeBinomial(targetSuccesses, successProbability, rng) {
  let failures = 0;
  let successes = 0;
  while (successes < targetSuccesses) {
    if (rng() <= successProbability) successes += 1;
    else failures += 1;
  }
  return failures;
}

function sampleUniform(min, max, rng) {
  return min + (max - min) * rng();
}

function sampleDiscrete(points, rng) {
  const totalWeight = points.reduce((sum, point) => sum + Number(point.weight), 0);
  let pick = rng() * totalWeight;
  for (const point of points) {
    pick -= Number(point.weight);
    if (pick <= 0) return Number(point.bps);
  }
  return Number(points[points.length - 1].bps);
}

function samplePareto(scale, alpha, rng) {
  const u = 1 - rng();
  return scale / Math.pow(u, 1 / alpha);
}

function sampleLogNormal(median, sigma, rng) {
  return median * Math.exp(sigma * sampleStandardNormal(rng));
}

function sampleBeta(alpha, beta, rng) {
  const x = sampleGamma(alpha, 1, rng);
  const y = sampleGamma(beta, 1, rng);
  return x / (x + y);
}

function sampleGamma(shape, scale, rng) {
  if (shape <= 0) throw new Error("gamma shape must be positive");
  if (shape < 1) {
    const u = rng();
    return sampleGamma(1 + shape, scale, rng) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    const x = sampleStandardNormal(rng);
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = rng();
    if (u < 1 - 0.0331 * Math.pow(x, 4)) return scale * d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return scale * d * v;
  }
}

function sampleStandardNormal(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function divideWithRounding(numerator, denominator, rounding) {
  if (denominator === 0n) throw new Error("division by zero");
  switch (rounding) {
    case "ceil":
      return (numerator + denominator - 1n) / denominator;
    case "nearest":
      return (numerator + denominator / 2n) / denominator;
    case "floor":
    default:
      return numerator / denominator;
  }
}

function mulDiv(a, b, denominator) {
  return (a * b) / denominator;
}

function sqrtBigInt(n) {
  if (n < 0n) throw new Error("sqrt negative");
  if (n < 2n) return n;
  let x0 = n / 2n;
  let x1 = (x0 + n / x0) / 2n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + n / x0) / 2n;
  }
  return x0;
}

function ratioNumber(numerator, denominator) {
  if (denominator === 0n) return 0;
  return Number(numerator) / Number(denominator);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function minBigInt(a, b) {
  return a < b ? a : b;
}

function maxBigInt(a, b) {
  return a > b ? a : b;
}

function diffBigInt(a, b) {
  return a > b ? a - b : b - a;
}
