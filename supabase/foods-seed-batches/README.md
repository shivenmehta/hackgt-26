# SQL Editor import batches

Run each linked file below in a separate SQL Editor query, in order.
The foods table must already exist. Each file is transactional and safe to rerun.
Use this index, not a folder glob: files from older exports may remain.

- [foods-001.sql](foods-001.sql): 16 foods, 195056 bytes
- [foods-002.sql](foods-002.sql): 14 foods, 195083 bytes
- [foods-003.sql](foods-003.sql): 15 foods, 195226 bytes
- [foods-004.sql](foods-004.sql): 31 foods, 196784 bytes
- [foods-005.sql](foods-005.sql): 29 foods, 195792 bytes
- [foods-006.sql](foods-006.sql): 38 foods, 196770 bytes
- [foods-007.sql](foods-007.sql): 48 foods, 195955 bytes
- [foods-008.sql](foods-008.sql): 50 foods, 199698 bytes
- [foods-009.sql](foods-009.sql): 40 foods, 195704 bytes
- [foods-010.sql](foods-010.sql): 19 foods, 143250 bytes

After all batches, run [verification](../verify-foods.sql). Expect 300 foods.
