import test from "node:test";
import assert from "node:assert/strict";

import {
  computeRequestedPayoutUnits,
  ilBpsFromRatio1e18,
  priceRatioFromMoveBps,
  runInsuranceSimulation,
} from "./insuranceSimulation.mjs";

test("contract-aligned payout caps reserve and adjusts premium after a paid claim", () => {
  const report = runInsuranceSimulation({
    periods: 2,
    portfolio: {
      policyCount: 1,
      principalPerPolicy: 100_000,
      exposurePerPolicy: 100_000,
      initialReserve: 5_000,
      coverageCapBps: 1_000,
      eligibilityThresholdPct: 80,
      inRange: { distribution: "fixed", value: 1 },
    },
    frequency: {
      distribution: "fixed",
      count: 1,
    },
    severity: {
      distribution: "fixed",
      valueBps: 9_000,
      minBps: 9_000,
      maxBps: 9_000,
      directionWeights: { up: 1, down: 0 },
    },
    claims: {
      cooldownPeriods: 0,
      maxExecutionAttempts: 1,
    },
    premiumRules: {
      pricingModel: "exposure_bps",
      basePremiumBps: 2,
      minimumPremiumPerPolicy: 0,
      expectedLossRatioBps: 100,
      actuarialLoadFactorBps: 10_000,
      rounding: "floor",
    },
    reactiveContract: {
      enabled: true,
      earlyWarnBps: 300,
      slopeWarnBps: 200,
      alertLevelHigh: 2,
      alertLevelTrend: 1,
      alertTtlPeriods: 1,
      reserveLowThreshold: 6_000,
      tightenThresholdValue: 2_000,
      premiumRateWhenImbalanced: 6,
      callbackSuccessProbability: 1,
      epochCheckpointEveryPeriods: 0,
    },
  });

  assert.equal(report.claims.paid, 2);
  assert.equal(report.claims.failedZeroPayout, 0);
  assert.equal(report.metrics.paidPayoutUnits, 5080);
  assert.equal(report.metrics.requestedPayoutUnits, 9860);
  assert.equal(report.metrics.endingReserveUnits, 0);
  assert.equal(report.reactive.operationalOutcomes.finalPremiumBps, 6);
  assert.equal(report.reactive.operationalOutcomes.thresholdTightenings, 2);
  assert.equal(report.metrics.reactivePremiumUpliftUnits, 40);
  assert.equal(report.metrics.reactiveActivationSuccessRate, 1);
});

test("ineligible claims are rejected after cooldown instead of being paid", () => {
  const report = runInsuranceSimulation({
    periods: 1,
    portfolio: {
      policyCount: 1,
      principalPerPolicy: 100_000,
      exposurePerPolicy: 100_000,
      initialReserve: 20_000,
      coverageCapBps: 5_000,
      eligibilityThresholdPct: 80,
      inRange: { distribution: "fixed", value: 0.5 },
    },
    frequency: {
      distribution: "fixed",
      count: 1,
    },
    severity: {
      distribution: "fixed",
      valueBps: 1_000,
      minBps: 1_000,
      maxBps: 1_000,
      directionWeights: { up: 1, down: 0 },
    },
    claims: {
      cooldownPeriods: 0,
      maxExecutionAttempts: 1,
    },
    premiumRules: {
      pricingModel: "exposure_bps",
      basePremiumBps: 2,
      minimumPremiumPerPolicy: 0,
      expectedLossRatioBps: 100,
      actuarialLoadFactorBps: 10_000,
      rounding: "floor",
    },
    reactiveContract: {
      enabled: true,
      earlyWarnBps: 300,
      slopeWarnBps: 200,
      alertLevelHigh: 2,
      alertLevelTrend: 1,
      alertTtlPeriods: 1,
      reserveLowThreshold: 5_000,
      tightenThresholdValue: 2_000,
      premiumRateWhenImbalanced: 6,
      callbackSuccessProbability: 1,
      epochCheckpointEveryPeriods: 0,
    },
  });

  assert.equal(report.claims.paid, 0);
  assert.equal(report.claims.rejectedIneligible, 1);
  assert.equal(report.metrics.paidPayoutUnits, 0);
  assert.equal(report.metrics.endingReserveUnits, 20020);
});

test("IL calculation remains symmetric for upward and downward price moves", () => {
  const upRatio = priceRatioFromMoveBps(2_500, "up");
  const downRatio = priceRatioFromMoveBps(2_000, "down");

  const ilUp = ilBpsFromRatio1e18(upRatio);
  const ilInverse = ilBpsFromRatio1e18((1_000_000_000_000_000_000n * 1_000_000_000_000_000_000n) / upRatio);
  const payout = computeRequestedPayoutUnits({
    principalUnits: 100_000_000_000n,
    priceRatio1e18: downRatio,
    coverageCapBps: 10_000,
  });

  assert.ok(ilUp > 0n);
  assert.ok(ilInverse > 0n);
  assert.ok(ilUp - ilInverse <= 1n && ilInverse - ilUp <= 1n);
  assert.ok(payout > 0n);
});
