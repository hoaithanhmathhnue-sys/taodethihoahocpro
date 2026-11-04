// ============================================
// THÔNG TIN ỨNG DỤNG & TÁC GIẢ (sửa một chỗ, dùng khắp app)
// ============================================
export const APP_INFO = {
  name: 'TẠO ĐỀ THI HÓA HỌC THPT',
  shortName: 'Tạo Đề Thi Hóa Học THPT',
  author: 'Thầy Nguyễn Thanh Phong',
  school: 'TRƯỜNG THPT NGUYỄN THƯỢNG HIỀN',
  specialty: 'CHUYÊN MÔN HÓA HỌC GDPT 2018',
  // Số Zalo nhận mua tài khoản: giữ theo bản cũ, đổi tại đây nếu chuyển người phụ trách
  contactZalo: '0348296773',
};

/** Môn duy nhất của app */
export const CHEMISTRY_SUBJECT = 'Hóa học';
/** Bộ sách dùng cho cả 3 khối */
export const TEXTBOOK_NAME = 'Kết nối tri thức với cuộc sống';
export const CHEMISTRY_GRADES = ['10', '11', '12'] as const;
