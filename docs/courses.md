# Courses and enrollment

Administrators open **Courses** in the notebook to create or rename a course and enroll active roster students. Select a course and a student to add or update their enrollment. Level is free text; practical (عملي) and theory (نظري) scores are optional numbers from 0 through 100. The course roster shows saved values. A student can belong to several courses; each student/course pair has one stable enrollment.

Select a course in the notebook to mark its enrolled students and see that course's attendance, summary, dashboard and attendance history. The previous/no-course view shows historical unscoped records; enrolled students cannot receive new unscoped marks. Notes remain student-scoped. Existing attendance is not assigned to any course automatically. A student account receives only its own projected attendance with course names, never notes or raw events. Teachers see enrollments for their assigned active students, subject to their existing access and expiry restrictions.

Apply `bun run db:migrate` to the target Railway database before deploying the application. The migration is repeatable. Test locally against a disposable database first; synthetic tests do not verify the live provider.
