import { describe, expect, it } from "vitest";
import { summarizeReviewStatus, type ReviewerResult } from "./resources.js";

const reviewer = (status: ReviewerResult["status"]): ReviewerResult => ({ name: "u", displayName: "U", status });

describe("summarizeReviewStatus", () => {
  it("reports NO_REVIEWERS when nobody is assigned", () => {
    expect(summarizeReviewStatus([])).toEqual({
      status: "NO_REVIEWERS",
      reviewed: false,
      approved: false,
      approvals: 0,
    });
  });

  it("reports NOT_REVIEWED when no reviewer has acted", () => {
    expect(summarizeReviewStatus([reviewer("UNAPPROVED"), reviewer("UNAPPROVED")])).toMatchObject({
      status: "NOT_REVIEWED",
      reviewed: false,
      approved: false,
    });
  });

  it("reports APPROVED when at least one reviewer approved and none requested changes", () => {
    expect(summarizeReviewStatus([reviewer("APPROVED"), reviewer("UNAPPROVED")])).toEqual({
      status: "APPROVED",
      reviewed: true,
      approved: true,
      approvals: 1,
    });
  });

  it("reports NEEDS_WORK when any reviewer requested changes, even with approvals", () => {
    expect(summarizeReviewStatus([reviewer("APPROVED"), reviewer("NEEDS_WORK")])).toEqual({
      status: "NEEDS_WORK",
      reviewed: true,
      approved: false,
      approvals: 1,
    });
  });
});
