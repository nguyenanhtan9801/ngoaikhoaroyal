import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, User, Check, X } from 'lucide-react';
import { Student, Enrollment, ExtracurricularClass } from '../types';

interface StudentSearchComboboxProps {
  students: Student[];
  enrollments?: Enrollment[];
  classes?: ExtracurricularClass[];
  selectedStudentId: string;
  onSelectStudent: (studentId: string) => void;
  placeholder?: string;
  prioritizeActiveEnrollments?: boolean;
}

export const StudentSearchCombobox: React.FC<StudentSearchComboboxProps> = ({
  students = [],
  enrollments = [],
  classes = [],
  selectedStudentId,
  onSelectStudent,
  placeholder = 'Tìm theo tên, mã học sinh hoặc SĐT phụ huynh...',
  prioritizeActiveEnrollments = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId);
  }, [students, selectedStudentId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = students;

    if (q) {
      list = list.filter((s) => {
        const matchName = s.name.toLowerCase().includes(q);
        const matchCode = (s.code || '').toLowerCase().includes(q);
        const matchPrevCode = (s.previous_student_code || '').toLowerCase().includes(q);
        const matchPhone = (s.parent_phone || '').includes(q);
        const matchParent = (s.parent_name || '').toLowerCase().includes(q);
        return matchName || matchCode || matchPrevCode || matchPhone || matchParent;
      });
    }

    if (prioritizeActiveEnrollments) {
      const activeIds = new Set(
        enrollments
          .filter((e) => e.status === 'active' || e.status === 'trial')
          .map((e) => e.student_id)
      );
      list = [...list].sort((a, b) => {
        const aActive = activeIds.has(a.id) ? 1 : 0;
        const bActive = activeIds.has(b.id) ? 1 : 0;
        return bActive - aActive;
      });
    }

    return list.slice(0, 30);
  }, [students, query, enrollments, prioritizeActiveEnrollments]);

  const getStudentClassInfo = (studentId: string) => {
    const userEnrollments = enrollments.filter((e) => e.student_id === studentId);
    if (userEnrollments.length === 0) return null;
    const classNames = userEnrollments
      .map((e) => classes.find((c) => c.id === e.class_id)?.name)
      .filter(Boolean);
    return classNames.length > 0 ? classNames.join(', ') : null;
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>

        <input
          type="text"
          value={isOpen ? query : selectedStudent ? `${selectedStudent.name} (${selectedStudent.code})` : ''}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setQuery('');
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all font-medium"
        />

        {selectedStudent && (
          <button
            type="button"
            onClick={() => {
              onSelectStudent('');
              setQuery('');
            }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-800/60 animate-in fade-in">
          {filteredStudents.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-500">
              Không tìm thấy học sinh nào phù hợp
            </div>
          ) : (
            filteredStudents.map((st) => {
              const isSelected = st.id === selectedStudentId;
              const classInfo = getStudentClassInfo(st.id);

              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    onSelectStudent(st.id);
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs transition-colors ${
                    isSelected
                      ? 'bg-amber-500/15 text-amber-200'
                      : 'hover:bg-slate-800/70 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 text-amber-400">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold truncate text-slate-100 flex items-center gap-1.5">
                        {st.name}
                        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 border border-slate-700">
                          {st.code}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        PH: {st.parent_name} • {st.parent_phone}
                        {classInfo && (
                          <span className="text-cyan-400 ml-1.5 font-medium">
                            • Đang học: {classInfo}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isSelected && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
