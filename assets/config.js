// إعدادات الموقع. عدّل هذا الملف فقط عند تغيير الرقم أو البريد أو بعد تشغيل خادم نظام العملاء.
// API: رابط تطبيق Google Apps Script بعد نشره (ينتهي بـ /exec). اتركه فارغاً ليعمل الموقع بدون خادم:
//   نموذج الطلب يجهز رسالة واتساب فقط، ونظام العملاء يحفظ البيانات في متصفح هذا الجهاز.
window.BASIRA_CONFIG = {
  API: "https://script.google.com/macros/s/AKfycbw7qcFIL5JcqRkJ44EwRd_UEy5b-TcsOPEmGksqwaemlNP-o0cWYLaBcZvoP1LFFRs/exec",
  WHATSAPP: "97472232609",
  PHONE: "+974 7223 2609",
  EMAIL: "baseeratactions@gmail.com",
  // إحصاء الزيارات دون ملفات تعريف ارتباط: ضع هنا «Website ID» من حساب Umami Cloud لبصيرة. فارغ = الإحصاء متوقف.
  UMAMI_ID: ""
};
