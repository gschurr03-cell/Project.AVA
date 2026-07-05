# Dev-seed fixtures

Small, committed assets used by the local development seed (`npm run dev:seed`).

As of Day 66 the seed no longer creates a demo sprint session — the dev dataset
focuses solely on the **static 20 m benchmark**. The retired "30 m fly" demo
fixtures (`demo-sprint.mp4` / `demo-sprint.pose.json`) were removed, and the seed
now only:

- upserts the permanent local dev account + athlete, and
- (re-)asserts the permanent **AVA Calab Vid 1** (VueMotion 20 m) benchmark row,
- deletes any previously seeded 30 m fly session + its storage objects.

To exercise the overlay/calibration end-to-end, upload the 20 m Calab video as a
session in the UI and link it to the AVA Calab Vid 1 benchmark. That video is not
committed (it's large); only the coach who has it uploads it locally.
