# Rollout plan

The first paragraph explains why the rollout moves in three stages instead of one.

The second paragraph names the flag, `upload_limits_enabled`, that gates the new limits for every workspace.

The third paragraph lists what the team checks before each stage goes out to more users.

- Turn the flag on for internal workspaces
- Watch the error rate for one full day
- Turn the flag on for everyone else
