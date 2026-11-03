import * as XLSX from 'xlsx';

export interface PartnershipReportItem {
  stt: number;
  studentCode: string;
  studentName: string;
  regularClass: string;
  subjectName: string;
  sessions: number;
  standardCourseFee: number;
  ratePerSession: number;
  actualPaidAmount: number;
  note: string;
}

export function exportPartnershipExcel(params: {
  campusName: string;
  subjectName: string;
  termName: string;
  termPeriodText: string;
  academicYear: string;
  classScheduleGroup: string; // VD: "LỚP THỨ 2 - THỨ 4"
  items: PartnershipReportItem[];
  ratioA?: number; // 0.5 (50%)
  ratioB?: number; // 0.5 (50%)
  standardSessionsCount?: number; // Mặc định 16 buổi
  partyAName?: string;
  partyBName?: string;
}) {
  const ratioA = params.ratioA ?? 0.5;
  const ratioB = params.ratioB ?? 0.5;
  const standardSessionsCount = params.standardSessionsCount || 16;
  const pctA = Math.round(ratioA * 10000) / 100;
  const pctB = Math.round(ratioB * 10000) / 100;

  const rows: any[][] = [
    ['CÔNG TY CP ĐT PT GD QUỐC TẾ HOÀNG GIA'],
    ['TRUNG TÂM QUẢN LÝ HỌC VỤ - DỊCH VỤ'],
    [],
    [
      `DANH SÁCH HỌC SINH NGOẠI KHOÁ PHỔ THÔNG MÔN ${params.subjectName.toUpperCase()} - ${params.campusName.toUpperCase()}`,
    ],
    [
      `${params.termName.toUpperCase()}, TỪ ${params.termPeriodText} - TẠI ROYAL SCHOOL (NH ${params.academicYear})`,
    ],
    [],
    [params.classScheduleGroup],
    [
      'STT',
      'MSHS',
      'HỌ TÊN',
      'LỚP',
      'MÔN',
      'SỐ BUỔI HỌC',
      `HỌC PHÍ ${standardSessionsCount} BUỔI`,
      'HỌC PHÍ/BUỔI',
      'HỌC PHÍ THỰC ĐÓNG THEO SỐ BUỔI HỌC',
      'GHI CHÚ',
    ],
  ];

  let totalActual = 0;

  params.items.forEach((item, index) => {
    const actual = Number(item.actualPaidAmount) || 0;
    totalActual += actual;
    rows.push([
      index + 1,
      item.studentCode,
      item.studentName,
      item.regularClass,
      item.subjectName,
      Number(item.sessions) || 0,
      Number(item.standardCourseFee) || 0,
      Number(item.ratePerSession) || 0,
      actual,
      item.note || '',
    ]);
  });

  const amountA = Math.round(totalActual * ratioA);
  const amountB = Math.round(totalActual * ratioB);

  // Chân bảng tổng kết
  rows.push([]);
  rows.push(['', '', '', '', '', '', '', 'TỔNG', totalActual, '']);
  rows.push([
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    `SỐ TIỀN ${params.partyAName || 'BÊN A'} ĐƯỢC HƯỞNG (${pctA}%)`,
    amountA,
    '',
  ]);
  rows.push([
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    `SỐ TIỀN ${params.partyBName || 'BÊN B'} ĐƯỢC HƯỞNG (${pctB}%)`,
    amountB,
    '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Gộp ô cho các dòng tiêu đề báo cáo
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 9 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 9 } },
    { s: { r: 6, c: 0 }, e: { r: 6, c: 9 } },
  ];

  // Định dạng số tiền có dấu phân cách hàng nghìn cho cột G, H, I (cột index 6, 7, 8)
  const dataStartRow = 8; // Dòng đầu tiên của danh sách học sinh (0-indexed)
  const totalEndRow = rows.length - 1;
  for (let r = dataStartRow; r <= totalEndRow; r++) {
    for (const c of [5, 6, 7, 8]) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellRef];
      if (cell && typeof cell.v === 'number') {
        cell.z = '#,##0';
      }
    }
  }

  // Đặt độ rộng cột tương ứng
  ws['!cols'] = [
    { wch: 6 },  // STT
    { wch: 15 }, // MSHS
    { wch: 26 }, // HỌ TÊN
    { wch: 10 }, // LỚP
    { wch: 18 }, // MÔN
    { wch: 13 }, // SỐ BUỔI
    { wch: 18 }, // HỌC PHÍ 16B
    { wch: 15 }, // HỌC PHÍ/BUỔI
    { wch: 24 }, // THỰC ĐÓNG
    { wch: 32 }, // GHI CHÚ
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Đối Soát Quyết Toán');
  const safeSubj = (params.subjectName || 'NgoaiKhoa').replace(/\s+/g, '_');
  const safeCampus = (params.campusName || 'RoyalSchool').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `BaoCao_DoiSoat_${safeSubj}_${safeCampus}.xlsx`);
}
