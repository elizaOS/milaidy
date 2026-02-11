# Phase 6: Chat Layout and Information Architecture

Goal: make autonomy visibility first-class without degrading chat usability.

## Current layout

Chat tab currently uses:

- left sidebar: conversations (`w-60`)
- center: `ChatView` content
- right sidebar: `WidgetSidebar` (`w-[260px]`)

## Proposed layout

New chat-shell structure:

- left: `ConversationsSidebar` (unchanged baseline width)
- center: `ChatView` (primary interaction)
- right: `AutonomousPanel` (wider than current widget panel)

Recommended right width strategy:

- desktop default: 340px
- compact desktop: 300px
- larger screens: up to 420px max

## Interaction modes

1. Expanded mode
   - full autonomous panel with all sections
2. Compact mode
   - reduced panel with key status + latest thought
3. Collapsed mode
   - icon rail and status indicator only

## Responsive behavior

At narrower breakpoints:

1. panel collapses by default
2. open as overlay drawer
3. preserve chat input focus and keyboard flow

## Information hierarchy rules

1. Chat remains primary for direct user interaction.
2. Autonomy panel remains continuously visible when expanded.
3. Error/critical autonomy alerts can surface lightweight badges in header/nav.

## Tradeoff analysis

## Option A: keep panel in chat right side (recommended)

Pros:

- continuous operator visibility while chatting
- minimal navigation friction

Cons:

- reduced horizontal space for chat

## Option B: move autonomy panel to Admin tab only

Pros:

- no chat width impact

Cons:

- weak operational workflow
- frequent context switching

## Option C: split-pane resizable handle

Pros:

- operator control over density

Cons:

- more interaction complexity
- persistence/responsive edge cases

Recommendation: Option A + optional resizable enhancement later.

## Technical file impacts

- `apps/app/src/App.tsx`
  - replace `WidgetSidebar` usage in chat shell
  - add collapse state wiring
- `apps/app/src/components/WidgetSidebar.tsx`
  - deprecate or repurpose into goals/tasks subcomponent
- new `apps/app/src/components/AutonomousPanel.tsx`
  - panel container and section composition

## Risks

1. chat text readability on smaller screens
   - mitigation: compact/collapsed modes with remembered preference.
2. layout jitter from dynamic event content
   - mitigation: fixed section heights + overflow containers.
3. style inconsistency across themes
   - mitigation: use existing design tokens and panel primitives.

## Testing

1. responsive snapshots (mobile/tablet/desktop)
2. keyboard navigation through chat input and panel controls
3. regression checks for conversation sidebar interactions

## Done criteria

1. Chat remains ergonomic.
2. Autonomy panel is discoverable and useful.
3. Responsive behavior is stable and predictable.

