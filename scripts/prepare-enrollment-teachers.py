"""Privately validate a workbook against its historical import plan and roster snapshot."""

import json
import sys
from pathlib import Path

from openpyxl import load_workbook


def prepare(workbook, plan, snapshot):
    if len(workbook.sheetnames) != 1:
        raise ValueError('Expected one sheet')
    sheet = workbook.active
    if sheet.cell(1, 1).value != 'الإسم الكامل':
        raise ValueError('Unexpected workbook layout')
    teachers = snapshot['backup']['teachers']
    teacher_names = [teacher['name'].strip() for teacher in teachers]
    if len(teacher_names) != len(set(teacher_names)):
        raise ValueError('Ambiguous teacher names')
    by_teacher = {teacher['name'].strip(): teacher['id'] for teacher in teachers}
    source = {}
    for row in sheet.iter_rows(min_row=3, values_only=True):
        name, teacher = row[0], row[7]
        if teacher is None or str(teacher).strip() == '':
            continue
        if not isinstance(name, str) or not isinstance(teacher, str):
            raise ValueError('Invalid workbook row')
        name, teacher = name.strip(), teacher.strip()
        if not name or name in source or teacher not in by_teacher:
            raise ValueError('Unknown or ambiguous workbook row')
        source[name] = by_teacher[teacher]
    rows = plan['rows']
    names = [row['student']['name'] for row in rows]
    if not source or len(names) != len(set(names)) or set(names) != set(source):
        raise ValueError('Workbook and plan students differ')
    for row in rows:
        if source[row['student']['name']] != row['student']['teacherId']:
            raise ValueError('Workbook and plan teachers differ')
    return {
        'courseId': plan['courseId'],
        'rows': [
            {
                'enrollmentId': row['enrollmentId'],
                'student': {
                    'id': row['student']['id'],
                    'teacherId': row['student']['teacherId'],
                    'name': row['student']['name'],
                },
            }
            for row in rows
        ],
    }


def main():
    if len(sys.argv) != 5:
        raise ValueError('Expected workbook, historical plan, roster snapshot and output path')
    workbook, plan, snapshot, output = map(Path, sys.argv[1:])
    result = prepare(
        load_workbook(workbook, data_only=True),
        json.loads(plan.read_text(encoding='utf-8')),
        json.loads(snapshot.read_text(encoding='utf-8')),
    )
    with output.open('x', encoding='utf-8') as target:
        json.dump(result, target, ensure_ascii=False)
    print(json.dumps({'matched': len(result['rows'])}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Preparation failed; check private inputs and workbook matches', file=sys.stderr)
        sys.exit(1)
