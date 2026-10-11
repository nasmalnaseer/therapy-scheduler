import React from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { format } from 'date-fns';

const Export = () => {
  const exportExcel = async () => {
    const [scheduleSnap, doctorSnap, patientSnap] = await Promise.all([
      getDocs(collection(db, 'schedule')),
      getDocs(collection(db, 'doctors')),
      getDocs(collection(db, 'patients'))
    ]);

    const doctors = {};
    doctorSnap.forEach(doc => doctors[doc.id] = doc.data());

    const patients = {};
    patientSnap.forEach(doc => patients[doc.id] = doc.data());

    const scheduleData = scheduleSnap.docs.map(doc => {
      const s = doc.data();
      return {
        date: format(new Date(s.startTime), 'yyyy-MM-dd'),
        time: format(new Date(s.startTime), 'HH:mm'),
        department: s.therapy,
        doctorId: s.doctorId,
        doctor: doctors[s.doctorId]?.name || s.doctorId,
        patient: patients[s.patientId]?.name || s.patientId
      };
    });

    // 🔢 Group by date > department > time
    const grouped = {};
    for (const entry of scheduleData) {
      const { date, department, time, doctor, doctorId, patient } = entry;

      if (!grouped[date]) grouped[date] = {};
      if (!grouped[date][department]) grouped[date][department] = {};
      if (!grouped[date][department][time]) grouped[date][department][time] = {};
      if (!grouped[date][department][time][doctor]) grouped[date][department][time][doctor] = [];

      grouped[date][department][time][doctor].push(patient);
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Schedule');

    let rowPointer = 1;

    Object.entries(grouped).forEach(([date, departments]) => {
      // Date row
      sheet.mergeCells(`A${rowPointer}:Z${rowPointer}`);
      sheet.getCell(`A${rowPointer}`).value = date;
      sheet.getCell(`A${rowPointer}`).font = { bold: true, size: 11, name: 'Times New Roman' };
      rowPointer++;

      Object.entries(departments).forEach(([department, times]) => {
        // Department row
        sheet.mergeCells(`A${rowPointer}:Z${rowPointer}`);
        sheet.getCell(`A${rowPointer}`).value = department;
        sheet.getCell(`A${rowPointer}`).font = { bold: true, size: 11, name: 'Times New Roman' };
        rowPointer++;

        const allDoctors = Array.from(
          new Set(Object.values(times).flatMap(timeBlock => Object.keys(timeBlock)))
        );

        // Header row: Time + doctor names
        const row = sheet.getRow(rowPointer);
row.getCell(1).value = 'Time';

        sheet.getCell(`A${rowPointer}`).font = { bold: true, size: 11, name: 'Times New Roman' };
        allDoctors.forEach((doctor, index) => {
          const col = String.fromCharCode(66 + index); // B, C, D...
          row.getCell(2 + index).value = doctor;
row.getCell(2 + index).font = {
  bold: true,
  size: 11,
  name: 'Times New Roman',
  color: { argb: 'FFFF0000' } // red
};

        });
        rowPointer++;

        Object.entries(times).forEach(([time, doctorPatients]) => {
          const row = sheet.getRow(rowPointer);
          row.getCell(1).value = time;
          row.getCell(1).font = { name: 'Times New Roman', size: 10 };

          allDoctors.forEach((docName, index) => {
            const col = 2 + index; // Column B onwards
            const patientsList = doctorPatients[docName] || [];
            row.getCell(col).value = patientsList.join(', ');
            row.getCell(col).font = { name: 'Times New Roman', size: 10 };
          });

          rowPointer++;
        });

        rowPointer++; // Space between departments
      });

      rowPointer++; // Space between dates
    });

    // Auto column widths
    sheet.columns.forEach(col => {
      let max = 10;
      col.eachCell?.((cell) => {
        const text = cell.value ? cell.value.toString() : '';
        max = Math.max(max, text.length);
      });
      col.width = max + 2;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), 'Thanal_Schedule.xlsx');
  };

  return (
    <div style={{ padding: '20px' }}>
      <h3>📤 Export Therapy Schedule</h3>
      <button onClick={exportExcel}>📊 Export Excel</button>
    </div>
  );
};

export default Export;
