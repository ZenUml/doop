# Diagramly Desktop support playbook

Internal draft. The desktop support URL is not live, and this playbook does not create a response-time promise. Use it only after a release owner publishes a support channel and confirms the privacy policy.

## Intake template

Ask for the minimum needed to reproduce the issue:

- App version, macOS version and Mac model.
- What the person expected and what happened, with steps to reproduce.
- Whether the issue affects one document or all documents.
- Whether the document can still be opened and whether a current backup exists.
- For import failures: exporter version, approximate library size and a redacted minimal JSON export if the person agrees.
- For MCP failures: MCP client and version, connection method, timestamp and redacted app logs. Never request an API key, model-provider token or full private library.
- For purchases (only after purchase support exists): storefront region, product shown, transaction status and Apple transaction reference. Never request an Apple password, full payment details or unredacted transaction JWS.

Before sharing a diagnostic bundle, inspect its contents locally. Remove source text, rendered diagrams, screenshots, prompts, tokens, personal email and purchase payloads unless the reporter explicitly approves a specific item.

## Triage levels

| Level | Example                                                                                                        | First response inside the team                                         | Action                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P0    | Confirmed data loss, unauthorized data access, or a widespread purchase entitlement failure                    | Assign an incident owner immediately; preserve logs and affected build | Stop rollout, disable affected cloud capability if possible, protect local data, establish recovery and update the incident record |
| P1    | Reproducible save/import failure affecting a major workflow, or paid access unavailable to a meaningful cohort | Reproduce on the reported build and a clean profile                    | Escalate to release owner; prepare a reviewed fix and safe customer workaround                                                     |
| P2    | Isolated rendering, setup or MCP failure with a documented workaround                                          | Acknowledge through the published support channel                      | Track reproduction and include in the next release decision                                                                        |
| P3    | Cosmetic issue, unclear copy or feature request                                                                | Add to product backlog                                                 | Review during normal planning                                                                                                      |

These levels are internal sorting rules. They are not response-time SLAs. Raise the level when evidence shows broader impact, data risk or inability to recover.

## Incident record

```text
Incident ID:
Start and detection time (UTC):
Incident owner:
Affected app versions / macOS versions:
Affected workflow and estimated users:
Observed impact (evidence):
Reproduction steps:
Data or entitlement risk:
Containment / feature controls used:
Customer-facing update owner and approved wording:
Recovery and verification evidence:
Root cause (after reproduction):
Follow-up actions, owners and due dates:
```

Do not claim recovery until a representative affected document or entitlement has been checked. For suspected data corruption, preserve a copy before attempting repair. Never ask users to downgrade the database or delete application data as a first step.

## Reply drafts

**Import or display issue**

> Thanks for reporting this. Please share the Diagramly Desktop and macOS versions, the steps that lead to the problem, and whether other documents open. Do not send your full library or credentials. If you are comfortable sharing a sample, remove private names and unrelated documents first.

**Purchase or restore issue**

> We can check the Apple transaction state once purchase support is active. Please share your storefront region, the product name shown, the approximate purchase date and any Apple transaction reference available in your purchase history. Never send your Apple password or payment-card details.

**Data recovery**

> Please stop editing the affected document for now. Do not uninstall the app or remove its data folder. Tell us whether you have a recent backup and share the app version and steps before the issue appeared. We will first preserve a copy of the available local data.

Use these only after support staff verify the facts for the case. Do not promise a fix date, recovery, refund decision or response time that has not been confirmed.
