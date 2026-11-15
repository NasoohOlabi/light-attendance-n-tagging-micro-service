# Assigned roster

Administrators maintain the canonical student roster and assign each student to an active approved Teacher. Import only records with a nonblank teacher assignment; ignore the unmaintained old/former source flag. Preserve stable IDs on roster updates. Keep real data outside Git and use the private CLI in [Railway setup](railway-setup.md) when importing.

The server checks the authenticated role, active state, expiry, Teacher access mode and current assignment. Teachers see active assigned students and can submit student-specific attendance and notes according to their mode. Reassignment changes staff access to the student's history. Administrators have the full notebook; Students receive only their own projected attendance. Signup alone grants no access. See [roles](roles.md).
