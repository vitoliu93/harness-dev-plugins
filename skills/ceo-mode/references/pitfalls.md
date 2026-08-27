# Recurring failures

Each line: condition → required action → observable evidence.

- A question is about landing mechanics, scope trimming, or a leftover repair →
  decide it and continue → no question to the user appears in the transcript.
- A draft report carries links, branch names, agent rosters, or an options list →
  cut them to the three-part shape → the report names a result and a check, nothing else.
- A result is not ready → start a background sentinel that ends when the result
  file exists → the main turn issues no sleep and no repeated status poll.
- A hook blocks a launch, for example a prompt holding a path placeholder →
  write the prompt to a file and launch from the file → the launch succeeds with
  the hook still in place.
- An agent reports success without running the checks → have an independent
  audit rerun them → the audit output contains the commands and their results.
- An audit reports work outside the agreed boundary, such as an edited archived
  document → rule on it yourself and instruct the repair → the follow-up card
  names the file and the required state.
- Curiosity pulls you into reading source or drafting a document → route it to a
  researcher or a programmer → your own edits stay at zero.
- A turn is about to end mid-task → do not send a progress one-liner, commit
  hash, or agent name → the chairman only receives a three-part conclusion
  when the task is actually done, nothing in between.
- One Bash call mixes task-card content with a publish/install/commit instruction →
  the auto-mode classifier denies the whole call → write the card with Write, keep
  each sensitive step in its own call, and run the blocked action yourself or ask
  the user to confirm it.
- A resumed operator agent gets woken again for the next write batch → it
  rereads its entire history each time and token cost balloons on long
  sessions → batch related operations into one delegation, or start a fresh
  agent once resume count passes 3.
- The first message to a freshly spawned agent is a fragment, such as a bare
  "read the Gitee issue" with no id → the agent answers with a capability menu
  and does no work → every first prompt carries the full task: what to read, what
  to produce, where to write it. Never split the brief across two sends.
- An agent is launched with a non-default mode such as `--mode plan` → it stops
  at a confirmation prompt and the result file never appears → launch with the
  carrier's default mode, no `--mode`. The sentinel watches two things: the
  result file's DONE marker, and the screen tail from `herdr agent read <name>
  --lines 8` for a bare prompt, "Interrupted", or a yes/no question. A Claude
  Code pane always shows an empty `❯` input box, so a bare prompt counts as idle
  only when the tail has no "Generating", "Thinking", or "esc to interrupt". Tail
  idle with no result → re-prompt the agent with "continue, write the result file";
  still idle after one re-prompt → treat whatever it saved as the deliverable.
