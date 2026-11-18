# Demo student data

Makes realistic students (Indian names, example.com emails, dummy phone numbers) for every open course, gives them access, and has them take tests through the app's own attempt code so results are genuine.

```
export AWS_PROFILE=pragyaprep-dev PRAGYA_TABLE_NAME=pragyaprep-dev PYTHONPATH=.
.venv/bin/python scripts/student_data/seed_students.py plan   --slug aaptprep
.venv/bin/python scripts/student_data/seed_students.py create --slug aaptprep
.venv/bin/python scripts/student_data/seed_students.py status --slug aaptprep
.venv/bin/python scripts/student_data/seed_students.py remove --slug aaptprep
```

- `plan` writes nothing. `create` skips emails that already exist. `remove --dry-run` shows what would go.
- Options: `--per-course 10`, `--seed 2026` (same seed, same students), `--batch demo-students-v1`.
- Every student carries the batch tag, so `remove` deletes only them (members, access, attempts) and fixes each test's attempt count.
- These students cannot sign in (their emails reach nobody); they exist to fill the admin Results and student result screens.
