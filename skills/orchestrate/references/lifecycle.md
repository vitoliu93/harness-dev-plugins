# Orchestration lifecycle

## 1. Prepare

1. State the final result and integrated check.
2. Pick the fewest roles.
3. Write role cards and dependency order.
4. Load `use-agents`; read routes and quota state.

## 2. Start

- Create one Herdr tab per role instance.
- Name agents `<run>-<role>` with a short unique run prefix.
- Record the returned agent name, tab ID, pane ID, and route ID.
- Keep all created tabs open until the full run finishes.

## 3. Pass work

- Start roles with no dependencies together.
- When a dependency finishes, the host checks its output and passes the exact
  artifact to the next role.
- Agents do not talk to each other directly.
- Send one clear correction list when a role misses its card. Repeated failure
  means choose another route or take the work back.

## 4. Handle quota

1. Save the route's reset message through `use-agents`.
2. Keep its tab and usable partial output.
3. Choose another available `normal` route for the same alias or role.
4. Use `fallback` only when normal routes are unavailable.
5. Wait for reset only when the user chooses to wait.

## 5. Accept and close

1. Run every role's completion checks.
2. Run the final integrated check.
3. Close only recorded tabs after all checks pass.
4. On cancellation or an unresolved block, leave tabs open and report IDs.
