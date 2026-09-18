# Run mechanics

Execution mechanics for loading teams, authoring cards, launching agents, sentinels, and progress logging.

- Load `orchestrate`, pick the team that fits the scene, then load `use-agents`
  for routes and launch.
- Use `orchestrate`'s default Herdr transport unless the user chooses another
  transport.
- Send a researcher for facts before choosing an approach.
- Write the card with Write; the first prompt is the full task pointing at that
  file — never a fragment, never mixed into a publish/install/commit Bash call.
- Launch with the carrier's default interactive mode; do not pass a `--mode`
  flag to an interactive Herdr launch.
- Wait through a background sentinel that watches for the result file; never
  sleep or poll in the main turn. Read that file, not the terminal scrollback.
- A job expected to run over 10 minutes must append one line per batch to a
  progress file (`N/M, elapsed, ETA, failures`); the sentinel watches that file's
  mtime through `wait-result.sh`'s progress-file parameter and wakes you only
  when it goes quiet past a threshold. No extra reporter agent, no timed
  check-ins.
