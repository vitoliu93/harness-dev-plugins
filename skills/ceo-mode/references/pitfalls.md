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
- A resumed operator agent gets woken again for the next write batch → it
  rereads its entire history each time and token cost balloons on long
  sessions → batch related operations into one delegation, or start a fresh
  agent once resume count passes 3.
