const validateVietnamesePlateNumberBackend = (plateNumber) => {
  if (!plateNumber || typeof plateNumber !== 'string') {
    return { isValid: false, message: 'Biển số không được để trống' };
  }

  const cleanPlate = plateNumber.trim().toUpperCase();

  // Patterns cho các loại biển số Việt Nam (giống frontend)
  const patterns = {
    car_short: /^\d{2}[A-Z]-\d{2}\.\d{2}$/,
    car_standard: /^\d{2}[A-Z]-\d{3}\.\d{2}$/,
    car_long: /^\d{2}[A-Z]-\d{4}\.\d{2}$/,
    motorcycle_old: /^\d{2}[A-Z]\d-\d{4}$/,
    motorcycle_new: /^\d{2}[A-Z]\d-\d{3}\.\d{2}$/,
    taxi: /^\d{2}[A-Z]-\d{5,}$/,
    diplomatic: /^\d{2}[A-Z]{2}-\d{2,3}\.\d{2}$/,
    military: /^[A-Z]{2}\d{4}$/,
    police: /^[A-Z]{2}\d{4}$/
  };

  // Kiểm tra từng pattern
  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(cleanPlate)) {
      // Kiểm tra mã tỉnh hợp lệ
      if (type !== 'military' && type !== 'police') {
        const provinceCode = parseInt(cleanPlate.substring(0, 2));
        if (provinceCode < 10 || provinceCode > 99) {
          return { isValid: false, message: 'Mã tỉnh không hợp lệ (phải từ 10-99)' };
        }
      }

      return { 
        isValid: true, 
        message: `Biển số ${type} hợp lệ`,
        vehicleType: type,
        formattedPlate: cleanPlate
      };
    }
  }

  return { 
    isValid: false, 
    message: 'Format biển số không đúng theo chuẩn Việt Nam'
  };
};
module.exports = {
    validateVietnamesePlateNumberBackend}