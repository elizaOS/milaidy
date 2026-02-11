# File-by-File Change Catalog

This is the implementation checklist for all files touched by the trigger project.

Legend:

- **M** = mandatory in recommended path
- **C** = conditional (depends on capability/runtime path decision)
- **N** = new file

---

## 1) Eliza Core Runtime Files

| File | M/C/N | Current Role | Planned Change | Control-Flow Impact | Test Impact |
|---|---|---|---|---|---|
| `eliza/packages/typescript/src/types/task.ts` | M | Task/metadata type definitions | Add typed trigger metadata field (`metadata.trigger`) and exported trigger-related types (or import from dedicated type file) | compile-time safety for worker/action/api mapping | unit type/serialization tests |
| `eliza/packages/typescript/src/services/task.ts` | C | scheduler tick and task execution | optional deterministic due-task sorting and trigger-safe diagnostics | execution order predictability and debuggability | scheduler order tests |
| `eliza/packages/typescript/src/runtime.ts` | C | task CRUD and worker registration | optional helper diagnostics for worker registration collisions | startup safety/visibility | worker registration tests |
| `eliza/packages/typescript/src/autonomy/service.ts` | M | autonomy think loop + message injection | add dedicated trigger injection helper with stable metadata contract | trigger instructions become first-class autonomy inputs | autonomy injection integration tests |

---

## 2) Eliza Core New Runtime Files

| File | M/C/N | Purpose | Planned Contents | Control-Flow Impact | Test Impact |
|---|---|---|---|---|---|
| `eliza/packages/typescript/src/services/triggerWorker.ts` (or equivalent location) | M + N | trigger task worker | validate + execute + reschedule + run-state updates | runtime trigger dispatch path | worker unit/integration tests |
| `eliza/packages/typescript/src/services/triggerScheduling.ts` | M + N | schedule normalization utilities | once/interval/cron normalization + next-run computation | consistent schedule behavior across action/API/worker | helper unit tests |
| `eliza/packages/typescript/src/types/trigger.ts` | C + N | trigger DTO/type contract | `TriggerConfig`, statuses, wake modes | shared contract across layers | compile-time validation |

---

## 3) Action and Capability Files (Recommended Path)

## 3.1 Advanced-capabilities path

| File | M/C/N | Current Role | Planned Change | Control-Flow Impact | Test Impact |
|---|---|---|---|---|---|
| `eliza/packages/typescript/src/advanced-capabilities/actions/createTask.ts` | M + N | new action | implement `CREATE_TASK` with trigger schedule extraction/validation/dedupe | conversational trigger creation | action unit tests |
| `eliza/packages/typescript/src/advanced-capabilities/actions/index.ts` | M | action exports | export `createTaskAction` | action discoverability in advanced set | smoke tests |
| `eliza/packages/typescript/src/advanced-capabilities/index.ts` | M | advanced action registration | add action to `advancedActions` | makes action available in advanced capability configs | capability registration tests |

## 3.2 Bootstrap compatibility path (if needed)

| File | M/C/N | Current Role | Planned Change | Control-Flow Impact | Test Impact |
|---|---|---|---|---|---|
| `eliza/packages/typescript/src/bootstrap/actions/createTask.ts` | C + N | bootstrap action | optional parallel action implementation | backward compatibility where bootstrap stack is active | compatibility tests |
| `eliza/packages/typescript/src/bootstrap/actions/index.ts` | C | bootstrap exports | export action | bootstrap visibility | smoke tests |
| `eliza/packages/typescript/src/bootstrap/index.ts` | C | bootstrap capability composition | register action under extended/autonomy config policy | bootstrap runtime path support | plugin config tests |

---

## 4) Milaidy Runtime Wiring Files

| File | M/C/N | Current Role | Planned Change | Control-Flow Impact | Test Impact |
|---|---|---|---|---|---|
| `milaidy/src/runtime/eliza.ts` | C | runtime boot + plugin composition | verify action/worker availability in actual loaded plugins; optionally add explicit trigger plugin/load flag | prevents silent action unavailability | startup action-list tests |
| `milaidy/src/runtime/milaidy-plugin.ts` | C | custom Milaidy plugin | optional trigger plugin/action/provider registration if needed for explicit availability | deterministic Milaidy feature wiring | plugin wiring tests |

---

## 5) Milaidy API Layer Files

| File | M/C/N | Current Role | Planned Change | Control-Flow Impact | Test Impact |
|---|---|---|---|---|---|
| `milaidy/src/api/server.ts` | M | imperative API router | add `/api/triggers` routes + validation + mapping + run-now + runs history + strict route order | complete trigger API surface | route + integration tests |

---

## 6) Milaidy Frontend API and State Files

| File | M/C/N | Current Role | Planned Change | Control-Flow Impact | Test Impact |
|---|---|---|---|---|---|
| `milaidy/apps/app/src/api-client.ts` | M | typed HTTP/WS client | add trigger DTOs + CRUD/run/runs methods | frontend-backend trigger contract | api-client tests |
| `milaidy/apps/app/src/AppContext.tsx` | M | global app state/actions | add trigger state, handlers, active-tab loading/polling | UI trigger workflow orchestration | context tests |

---

## 7) Milaidy Frontend Navigation/View Files

| File | M/C/N | Current Role | Planned Change | Control-Flow Impact | Test Impact |
|---|---|---|---|---|---|
| `milaidy/apps/app/src/navigation.ts` | M | tab model and route map | add `triggers` tab/path/title/group | URL routing + tab identity | routing tests |
| `milaidy/apps/app/src/components/Nav.tsx` | M | tab rendering filter | include `triggers` in valid tab set | tab visibility | UI smoke |
| `milaidy/apps/app/src/App.tsx` | M | view router | import and route `TriggersView` | actual page rendering | view-router tests |
| `milaidy/apps/app/src/components/TriggersView.tsx` | M + N | trigger UI page | implement list/form/actions/history UI | user trigger management flow | component tests |

---

## 8) Test Files to Add

File names may vary by local convention; suggested additions:

| File | M/C/N | Coverage |
|---|---|---|
| `eliza/packages/typescript/src/__tests__/trigger-scheduling.test.ts` | M + N | schedule normalization and cron/once/interval semantics |
| `eliza/packages/typescript/src/__tests__/trigger-worker.test.ts` | M + N | worker execution, reschedule, failure handling |
| `eliza/packages/typescript/src/__tests__/create-task-action.test.ts` | M + N | parse/validation/dedupe/quota behavior |
| `milaidy/test/api-triggers.e2e.test.ts` | M + N | API route contract and ordering |
| `milaidy/apps/app/test/triggers-view.test.tsx` | M + N | UI interactions and form validation |
| `milaidy/apps/app/test/app-context-triggers.test.ts` | M + N | state orchestration and polling lifecycle |

---

## 9) Optional Ops/Config Files

| File | M/C/N | Planned Change |
|---|---|---|
| `milaidy/src/config/config.ts` (or equivalent) | C | add trigger feature flags defaults |
| `milaidy/docs/*` | M | operator runbooks and rollout notes |

---

## 10) Execution Checklist (Ordered)

1. Add trigger metadata types and schedule helpers.
2. Implement and register trigger worker.
3. Implement action creation path in capability stack used by runtime.
4. Add API trigger routes with validation and strict order.
5. Add frontend client/context/view/navigation wiring.
6. Add run records and health observability.
7. Add tests across unit/integration/e2e.
8. Roll out behind feature flags and staged gates.

---

## 11) Critical Path Verification Before Coding

Before implementation begins, verify at runtime:

1. which actions are loaded in Milaidy
2. which services are loaded in Milaidy
3. whether trigger worker registration appears in startup diagnostics

If these checks are skipped, there is a high chance of implementing into the wrong capability path.

---

## 12) Definition of Done Across This Catalog

Done is not "files modified." Done requires:

- all mandatory files updated,
- all mandatory tests added and passing,
- action/worker/routes confirmed in actual Milaidy runtime,
- feature flags and rollback controls available.

