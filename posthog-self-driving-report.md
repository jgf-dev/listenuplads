# PostHog Self-driving setup report

## Summary

PostHog Self-driving is configured with Session Replay, Error Tracking, and Support enabled, plus native health, error, and support signal sources. The scout troop and two Replay Vision monitors are active. Findings should start appearing in the [Self-driving inbox](https://us.posthog.com/project/322783/inbox) within about 30 minutes.

## AI data processing

Approved by the wizard’s organization-level gate before this setup ran.

## GitHub

GitHub was already connected before this run. No GitHub Issues responder was enabled because the connected-tools selection timed out without authorization.

## Products enabled

| Product                 | Result          | SDK check                                                                                  |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| Session Replay          | Already enabled | Web `posthog.init` has no `disable_session_recording: true` override.                      |
| Error Tracking          | Already enabled | Web `posthog.init` has no `capture_exceptions: false` override.                            |
| Support / Conversations | Enabled         | An inbound email, inbox, or Slack channel is still required before support tickets arrive. |

## Signal sources

| Signal source                          | Action                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `signals_scout` / `cross_source_issue` | On by default; no opt-out row exists.                                                  |
| `health_checks` / `health_issue`       | Enabled (source config `01a0cad7-3d53-7326-8fb3-8c2e09ad9ff9`).                        |
| `error_tracking` / `issue_created`     | Enabled (source config `01a0cad7-3d31-7ba7-85b4-bb2e4f10339b`).                        |
| `error_tracking` / `issue_reopened`    | Enabled (source config `01a0cad7-3d7c-729f-9b03-02acdc935d35`).                        |
| `error_tracking` / `issue_spiking`     | Enabled (source config `01a0cad7-3e39-749d-a588-b93191760b37`).                        |
| `conversations` / `ticket`             | Enabled (source config `01a0cad7-3cb2-7d5c-a2a9-111704ec4bc7`).                        |
| Session replay responder               | Deliberately skipped: Replay Vision scanners are the active route for replay findings. |

## Connected tools

No external tool was selected: the authorization picker timed out without a response. No external responders or data warehouse sources were changed.

## Scout troop

Five scouts are enabled, all on the server default daily schedule and configured to emit findings:

| Enabled scout                      | What it watches                                                   |
| ---------------------------------- | ----------------------------------------------------------------- |
| `signals-scout-general`            | Cross-product patterns and surfaces without a specialist.         |
| `signals-scout-anomaly-detection`  | Unexpected changes in saved dashboards and insights.              |
| `signals-scout-observability-gaps` | Important event activity without relevant monitoring coverage.    |
| `signals-scout-product-analytics`  | Product journey and engagement regressions.                       |
| `signals-scout-web-analytics`      | Traffic, attribution, landing-page health, and web usage changes. |

The remaining 22 scouts are disabled to keep the troop selective:

| Disabled scout(s)                           | Reason                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| AI observability, APM, logs, MCP tool calls | No evidence that these data surfaces are used by this project.                        |
| Conversations                               | Support was enabled, but no inbound channel or ticket activity is configured yet.     |
| CSP violations                              | No CSP reporting configuration was found.                                             |
| Customer analytics                          | No account or group analytics evidence was found.                                     |
| Data pipelines, data warehouse              | No pipeline or warehouse source evidence was found.                                   |
| Error tracking                              | Covered by the native Error Tracking responders.                                      |
| Experiments, feature flags, insight alerts  | No active use was found.                                                              |
| Inbox validation, PR follow-up              | A newly configured inbox has no resolved reports or Self-driving changes to validate. |
| Replay Vision, session replay               | Covered by the Replay Vision scanners and their own signal route.                     |
| Revenue analytics                           | No payment or revenue instrumentation was found.                                      |
| Skills store, tasks                         | No active project use was found.                                                      |
| Surveys                                     | No surveys exist.                                                                     |
| Web vitals                                  | Web analytics is active, but no Core Web Vitals surface was confirmed.                |

**Run budget:** 100 runs per day; 0 runs used and 100 remaining when checked. The server banner states: “Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more.”

## Custom scouts

No custom scout was created. The repository contains a small browser interaction surface: a counter-control capture in `src/counter.ts`. The strongest possible custom candidates were counter-interaction liveness and client capture health, but both overlap the enabled product analytics, anomaly detection, and observability-gap scouts; the product does not yet expose a distinct funnel or job success/failure pair that would justify a separate recurring scout.

The custom-scout approval prompt was not opened because the preceding connected-tools picker timed out and indicated that further interactive prompts should be avoided. If needed later, candidates should be proposed before creation. For any noisy custom scout, set `emit: false` on its config in PostHog to retain dry-run behavior without inbox output.

## Replay Vision scanners

A scanner is an LLM that watches individual session recordings on a schedule and pushes high-confidence findings to the inbox. These are the only configuration in this setup that spends Replay Vision quota. Findings arrive at half weight and need independent corroboration before promotion into a report.

| Brief               | Scanner                                                                                                              | Status                   | Scope                                                                                                                                                         | Sampling |       Estimated monthly usage |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ----------------------------: |
| Breakage monitor    | [Starter page breakage](https://us.posthog.com/project/322783/replay-vision/01a0caf4-daaa-7fad-a336-41897edc5472)    | Created; signals enabled | URL-scoped to the root starter page, the only completion surface found in the frontend; watches the rendered page, counter control, links, and visual assets. |      50% | 25 observations / 125 credits |
| Frustration monitor | [Starter page frustration](https://us.posthog.com/project/322783/replay-vision/01a0caf4-da5f-72b2-9e5d-7ff6121f33ab) | Created; signals enabled | `$rageclick` only; watches visible struggle with the counter and page links without adding a URL filter.                                                      |     100% |    0 observations / 0 credits |

At setup, the organization had 2,500 remaining Replay Vision credits and no credits used. Rate the initial observations in each scanner’s UI to generate configuration recommendations.

## Follow-ups

- [ ] Connect a Support inbound channel (email, inbox, or Slack) in PostHog so the enabled Support responder can receive tickets.
- [ ] Re-run connected-tools setup or configure responders from the [inbox](https://us.posthog.com/project/322783/inbox) if GitHub Issues, Linear, Jira, Sentry, Zendesk, or another external tool should trigger draft PRs.
- [ ] Consider a custom scout once the product has a distinct, ordered user journey or success/failure event pair beyond the starter counter interaction.
- [ ] Review and rate early Replay Vision observations in the two scanner pages to tune their prompts.

## What happens next

The scout coordinator picks up fresh configs within about 30 minutes. Scouts draw from the project’s daily run budget, findings cluster into reports in the inbox, and immediately actionable findings can start coding tasks.

## Files modified or created

- Created `posthog-self-driving-report.md`.
- No application source files were modified.
