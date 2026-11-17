# Hana Exam Online — ระบบสอบและประเมินผลออนไลน์แบบ Real-time (Google Sheets Database)

โปรเจกต์ **Hana Exam Online** สำหรับสร้างชุดข้อสอบออนไลน์ จัดการห้องสอบได้ไม่จำกัด และรายงานผลคะแนนแบบ Real-time พร้อมเชื่อมต่อฐานข้อมูล **Google Sheets** และ **Google Apps Script** ที่มีอยู่ในระบบได้ทันที รวมถึงรองรับการนำเข้าข้อสอบจากไฟล์ **Word (`.docx`)**, **PDF (`.pdf`)**, และ **Excel (`.xlsx` / `.csv`)**

---

## ✨ จุดเด่นที่อัปเดตใหม่
1. **เปลี่ยนชื่อและโลโก้เป็น Hana Exam Online**:
   - เปลี่ยนชื่อระบบทุกหน้า (ทั้งหน้าผู้คุมสอบและหน้ามือถือของผู้เข้าสอบ) เป็น **Hana Exam Online (Smart Assessment System)**
   - เปลี่ยนไอคอนโลโก้และ Favicon บนแท็บเบราว์เซอร์เป็นสัญลักษณ์ **หมวกบัณฑิตและเครื่องหมายถูกบนเกราะสีน้ำเงิน-ฟ้า (Hana Tech Gradient)** ไม่ซ้ำกับจุดสีส้มของ Socrative เดิม
2. **สร้างและสลับชื่อห้องสอบ (Rooms) เพิ่มได้ไม่จำกัด**:
   - ที่เมนู **Rooms** สามารถกด **"+ สร้างห้องสอบเพิ่ม"** เพื่อสร้างรหัสห้องสอบใหม่ได้ไม่จำกัด (เช่น `BASICCHANA`, `HANA-ORIENT`, `LINUS2X-QA`, `HANA-ESD01` หรือชื่อแผนก/รุ่นอบรมใดก็ได้)
   - สามารถกดสลับห้องที่ต้องการใช้งาน คัดลอกลิงก์เฉพาะของแต่ละห้อง หรือเลือกห้องตอนกดปุ่ม **Start Exam / Quiz** ได้ทันที
3. **เชื่อมต่อฐานข้อมูล Google Sheets & Apps Script อัตโนมัติ**:
   - เชื่อมต่อกับ Google Apps Script Web App URL ที่มีอยู่ในโปรเจกต์เรียบร้อยแล้ว (`https://script.google.com/macros/s/AKfycby3V0oPb2vz7qu2b-RXjCqjMYtdEiySGYcnDmh375IbJBfjS8DTJQ-4z0hOSO0gXL1B/exec`)
   - สร้างตาราง `Rooms`, `Quizzes`, `Questions`, `Sessions`, `Responses` และแยกแท็บผลสอบตามชื่อชุดข้อสอบใน Google Sheets ให้อัตโนมัติ

---

## 📁 โครงสร้างไฟล์ในโปรเจกต์
- [index.html](file:///C:/Users/thanaty/.gemini/antigravity/scratch/socrative-quiz-app/index.html) — หน้าเว็บหลักของระบบ **Hana Exam Online** (รวมทั้งหน้าผู้คุมสอบและหน้าทำข้อสอบผ่านมือถือของผู้เข้าสอบ)
- [css/style.css](file:///C:/Users/thanaty/.gemini/antigravity/scratch/socrative-quiz-app/css/style.css) — ดีไซน์ UI โทนสีน้ำเงิน-ฟ้าของ Hana Exam Online
- [js/app.js](file:///C:/Users/thanaty/.gemini/antigravity/scratch/socrative-quiz-app/js/app.js) — ระบบจัดการห้องสอบไม่จำกัด, สร้างข้อสอบหลายชุด, สกัดข้อสอบจาก Word/PDF/Excel, สร้างข้อสอบด้วย AI และตารางผลสอบ Real-time
- [google-apps-script/Code.gs](file:///C:/Users/thanaty/.gemini/antigravity/scratch/socrative-quiz-app/google-apps-script/Code.gs) — โค้ด Google Apps Script สำหรับสร้างตารางฐานข้อมูลใน Google Sheets อัตโนมัติ
- [api.php](file:///C:/Users/thanaty/.gemini/antigravity/scratch/socrative-quiz-app/api.php) — ไฟล์ PHP Proxy เสริมสำหรับกรณีนำไปฝากบน PHP Web Hosting
