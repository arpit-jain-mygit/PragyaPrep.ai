# Demo coursework

Adds a ready-made coursework plan to every open course, all using the same sample PDF and sample video (stored in each course's own folder). The plan goes through the app's own coursework code, so it is what an admin would build.

```
export AWS_PROFILE=pragyaprep-dev PRAGYA_TABLE_NAME=pragyaprep-dev PRAGYA_BUCKET_NAME=pragyaprep-content-dev-552808407801 PYTHONPATH=.
.venv/bin/python scripts/coursework_data/seed_coursework.py plan   --slug aaptprep
.venv/bin/python scripts/coursework_data/seed_coursework.py create --slug aaptprep
.venv/bin/python scripts/coursework_data/seed_coursework.py status --slug aaptprep
.venv/bin/python scripts/coursework_data/seed_coursework.py remove --slug aaptprep
```

- Per course: the first 4 subjects, 3 topics each (the subject's usual topics), 3 sub-topics each (Concepts with the PDF, Worked examples with the video, Practice and revision with both plus a link).
- Finish-by dates run over the coming weeks: on sub-topics, topics and subjects; the middle sub-topic follows its topic's date. About one in eight sub-topics stays a draft.
- Options: `--subjects 4`, `--topics 3`, `--seed 2026` (same seed, same plan), `--batch demo-coursework-v1`, and `remove --dry-run`.
- A course that already has a plan (or sample files from this batch) is left alone, so running it again changes nothing.
- Everything is tagged `demo_seed`, so `remove` deletes only the script's plan items, files and stored copies; anything an admin added by hand stays.
- The sample video comes from ffmpeg (an 8-second test pattern with a tone); without ffmpeg a tiny stand-in file is used.
