import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, User, Phone, GraduationCap, Check, ChevronDown } from 'lucide-react';
import { Student, Enrollment, ExtracurricularClass } from '../types';

interface StudentSearchComboboxProps {
  students: Student[];
  enrollments: Enrollment[];
  classes?: ExtracurricularClass[];
  selectedStudentId: string;
  onSelectStudent: (studentId: string) => void;
  placeholder?: string;
  prioritizeActiveEnrollments?: boolean;
}

// Helper to normalize Vietnamese accents for flexible search
const removeAccents = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
};

// Highlight matching substring
const highlightMatch = (text: string, query: string) => {
  if (!query.trim()) return text;
  const cleanQuery = query.trim();
  const normText = removeAccents(text);
  const normQuery = removeAccents(cleanQuery);
  const matchIdx = normText.indexOf(normQuery);

  if (matchIdx === -1) return text;

  const before = text.slice(0, matchIdx);
  const match = text.slice(matchIdx, matchIdx + cleanQuery.length);
  const after = text.slice(matchIdx + cleanQuery.length);

  return (
    <>
      {before}
      <mark className="bg-amber-500/30 text-amber-200 rounded px-0.5 font-extrabold">
        {match}
      </mark>
      {after}
    </>
  );
};

export const StudentSearchCombobox: React.FC<StudentSearchComboboxProps> = ({
  students,
  enrollments,
  classes = [],
  selectedStudentId,
  onSelectStudent,
  placeholder = 'Gõ tên, mã học sinh (RY-...), SĐT phụ huynh để tìm nhanh...',
  prioritizeActiveEnrollments = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedStudent = useMemo(
    () => students.find(s => s.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Map student -> active enrollment count & class names
  const studentEnrollmentMeta = useMemo(() => {
    const map: Record<string, { activeCount: number; classNames: string[] }> = {};
    students.forEach(s => {
      const activeEnrs = enrollments.filter(
        e => e.student_id === s.id && (e.status === 'active' || e.status === 'trial')
      );
      const classNames = activeEnrs
        .map(e => classes.find(c => c.id === e.class_id)?.name)
        .filter((n): n is string => Boolean(n));
      map[s.id] = {
        activeCount: activeEnrs.length,
        classNames,
      };
    });
    return map;
  }, [students, enrollments, classes]);

  // Filtered & ranked students
  const filteredStudents = useMemo(() => {
    const trimmed = query.trim();
    const normQuery = removeAccents(trimmed);

    const matched = students.filter(s => {
      if (!trimmed) return true;
      const nameNorm = removeAccents(s.name || '');
      const codeNorm = (s.code || '').toLowerCase();
      const phoneNorm = (s.parent_phone || '').toLowerCase();
      const parentNorm = removeAccents(s.parent_name || '');
      const gradeNorm = removeAccents(s.regular_class || '');

      return (
        nameNorm.includes(normQuery) ||
        codeNorm.includes(normQuery) ||
        phoneNorm.includes(normQuery) ||
        parentNorm.includes(normQuery) ||
        gradeNorm.includes(normQuery)
      );
    });

    if (prioritizeActiveEnrollments) {
      return [...matched].sort((a, b) => {
        const countA = studentEnrollmentMeta[a.id]?.activeCount || 0;
        const countB = studentEnrollmentMeta[b.id]?.activeCount || 0;
        if (countA !== countB) return countB - countA;
        return a.name.localeCompare(b.name, 'vi');
      });
    }

    return matched;
  }, [students, query, prioritizeActiveEnrollments, studentEnrollmentMeta]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlighted index when query or open state changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  const handleSelect = (student: Student) => {
    onSelectStudent(student.id);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuery('');
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        filteredStudents.length > 0 ? (prev + 1) % filteredStudents.length : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        filteredStudents.length > 0
          ? (prev - 1 + filteredStudents.length) % filteredStudents.length
          : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredStudents[highlightedIndex];
      if (target) {
        handleSelect(target);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setQuery('');
    }
  };

  const selectedMeta = selectedStudent ? studentEnrollmentMeta[selectedStudent.id] : null;

  // Display value in input: when open, show `query`; when closed, show selected student's formatted label
  const inputDisplayValue = isOpen
    ? query
    : selectedStudent
    ? `${selectedStudent.name} (${selectedStudent.code})${
        selectedMeta && selectedMeta.activeCount > 0
          ? ` • [${selectedMeta.activeCount} lớp đang học]`
          : ' • [Chưa có lớp]'
      }`
    : '';

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Main Searchable Input Box */}
      <div
        onClick={() => {
          if (!isOpen) {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 10);
          }
        }}
        className={`relative flex items-center w-full rounded-xl bg-slate-900 border transition-all ${
          isOpen
            ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-lg shadow-amber-500/10'
            : 'border-slate-700 hover:border-slate-600'
        }`}
      >
        <div className="pl-3.5 pr-2 flex items-center pointer-events-none text-amber-400">
          <Search className="w-4 h-4 shrink-0" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputDisplayValue}
          onFocus={() => setIsOpen(true)}
          onChange={e => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            isOpen && selectedStudent
              ? `Đang chọn: ${selectedStudent.name} (${selectedStudent.code}) — Gõ để tìm học sinh khác...`
              : placeholder
          }
          className="w-full py-2.5 pr-16 bg-transparent text-xs font-semibold text-white placeholder:text-slate-500 placeholder:font-normal focus:outline-none"
        />

        <div className="absolute right-2 flex items-center gap-1">
          {(query || selectedStudent) && (
            <button
              type="button"
              onClick={handleClear}
              title="Xóa nhanh để tìm học sinh khác"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setIsOpen(prev => !prev);
              if (!isOpen) setTimeout(() => inputRef.current?.focus(), 10);
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isOpen ? 'rotate-180 text-amber-400' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Selected Student Quick Summary Strip (when closed and student selected) */}
      {selectedStudent && !isOpen && (
        <div className="mt-1.5 px-3 py-1.5 rounded-xl bg-slate-900/70 border border-slate-800/90 flex items-center justify-between gap-2 flex-wrap text-[11px]">
          <div className="flex items-center gap-2 text-slate-300 flex-wrap">
            <span className="inline-flex items-center gap-1 font-bold text-white">
              <User className="w-3 h-3 text-amber-400" />
              {selectedStudent.name}
            </span>
            <span className="font-mono text-amber-400 font-semibold">
              {selectedStudent.code}
            </span>
            {selectedStudent.regular_class && (
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                Lớp {selectedStudent.regular_class}
              </span>
            )}
            {selectedStudent.parent_phone && (
              <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[10px]">
                <Phone className="w-2.5 h-2.5 text-cyan-400" />
                {selectedStudent.parent_phone}
              </span>
            )}
          </div>

          <div>
            {selectedMeta && selectedMeta.activeCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                • [{selectedMeta.activeCount} lớp đang học]
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                • [Chưa có lớp]
              </span>
            )}
          </div>
        </div>
      )}

      {/* Dropdown Suggestion Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl bg-[#0F172A]/98 border border-slate-700/90 shadow-2xl shadow-black/80 backdrop-blur-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header status bar */}
          <div className="px-3.5 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
            <span>
              {query.trim()
                ? `Tìm thấy ${filteredStudents.length} học sinh phù hợp`
                : `Danh sách gợi ý (${filteredStudents.length} học sinh)`}
            </span>
            <span className="font-mono text-slate-500">↑↓ Chọn • Enter Xác nhận</span>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="p-6 text-center space-y-1.5">
              <div className="text-xs font-semibold text-slate-300">
                Không tìm thấy học sinh phù hợp với từ khóa &ldquo;{query}&rdquo;...
              </div>
              <div className="text-[11px] text-slate-500">
                Hãy thử gõ tên học sinh, mã học viên (RY- / OUT-) hoặc số điện thoại phụ huynh.
              </div>
            </div>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60 custom-scrollbar">
              {filteredStudents.slice(0, 20).map((student, idx) => {
                const meta = studentEnrollmentMeta[student.id] || {
                  activeCount: 0,
                  classNames: [],
                };
                const isSelected = student.id === selectedStudentId;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <button
                    key={student.id}
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(student)}
                    className={`w-full text-left px-3.5 py-2.5 transition-colors flex items-center justify-between gap-3 ${
                      isHighlighted
                        ? 'bg-amber-500/15'
                        : isSelected
                        ? 'bg-slate-800/70'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Row 1: Student Name + Student Code + Active Classes Tag */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-xs">
                          {highlightMatch(student.name, query)}
                        </span>
                        <span className="font-mono text-[11px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          {highlightMatch(student.code, query)}
                        </span>

                        {meta.activeCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            • [{meta.activeCount} lớp đang học]
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            • [Chưa có lớp]
                          </span>
                        )}
                      </div>

                      {/* Row 2: Regular Class & Parent Phone & Active Class Names */}
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <GraduationCap className="w-3 h-3 text-slate-500" />
                          <span>
                            {student.regular_class ||
                              (student.is_royal_student ? 'ROYAL SCHOOL' : 'Học sinh ngoài trường')}
                          </span>
                        </span>

                        {student.parent_phone && (
                          <span className="inline-flex items-center gap-1 font-mono text-slate-300">
                            <Phone className="w-3 h-3 text-cyan-400" />
                            <span>{highlightMatch(student.parent_phone, query)}</span>
                            {student.parent_name && (
                              <span className="text-slate-500 font-sans">
                                ({student.parent_name})
                              </span>
                            )}
                          </span>
                        )}

                        {meta.classNames.length > 0 && (
                          <span className="text-[10px] text-amber-300/90 truncate max-w-xs">
                            Đang học: {meta.classNames.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
