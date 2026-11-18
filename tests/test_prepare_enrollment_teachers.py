import importlib.util
import unittest
from pathlib import Path

from openpyxl import Workbook

spec = importlib.util.spec_from_file_location(
    'prepare', Path(__file__).parents[1] / 'scripts/prepare-enrollment-teachers.py'
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreparationTest(unittest.TestCase):
    def test_match_and_conflicts(self):
        book = Workbook()
        book.active.cell(1, 1, 'الإسم الكامل')
        book.active.cell(3, 1, 'Student')
        book.active.cell(3, 8, 'Teacher')
        book.active.cell(4, 1, 'No teacher')
        plan = {
            'courseId': 'course',
            'rows': [
                {
                    'enrollmentId': 'enrollment',
                    'student': {'id': 'student', 'name': 'Student', 'teacherId': 'teacher'},
                }
            ],
        }
        snapshot = {'backup': {'teachers': [{'name': 'Teacher', 'id': 'teacher'}]}}
        self.assertEqual(len(module.prepare(book, plan, snapshot)['rows']), 1)
        book.active.cell(3, 8, 'Unknown')
        with self.assertRaises(ValueError):
            module.prepare(book, plan, snapshot)
        book.active.cell(3, 8, 'Teacher')
        book.active.cell(4, 1, 'Student')
        book.active.cell(4, 8, 'Teacher')
        with self.assertRaises(ValueError):
            module.prepare(book, plan, snapshot)


if __name__ == '__main__':
    unittest.main()
