import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';
import { useData } from '../context/DataContext';
import { addDays, dateKey, startOfDay } from '../utils/timeUtils';

const Export = () => {
  const { schedule, doctors: doctorList, patients: patientList } = useData();
  const [from, setFrom] = useState(dateKey(new Date()));
  const [to, setTo] = useState(dateKey(addDays(startOfDay(new Date()), 6)));

  const exportExcel = async () => {
    const doctors = {};
    doctorList.forEach(d => (doctors[d.id] = d));

    const patients = {};
    patientList.forEach(p => (patients[p.id] = p));

    // only the chosen dates, cancelled sessions left out, in time order
    const scheduleData = schedule
      .filter(s => s.status !== 'cancelled')
      .filter(s => {
        const k = dateKey(new Date(s.startTime));
        return k >= from && k <= to;
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map(s => {
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

    if (scheduleData.length === 0) {
      alert('There are no sessions in that date range.');
      return;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), 'Therapy_Schedule.xlsx');
  };

  return (
    <div style={{ padding: '20px' }}>
      <h3>📤 Export Therapy Schedule</h3>
      <div className="row">
        <label>From <input type="date" value={from} onChange={e => e.target.value && setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={e => e.target.value && setTo(e.target.value)} /></label>
        <button onClick={exportExcel}>📊 Export Excel</button>
      </div>
      <p className="muted">Cancelled sessions are not included.</p>
    </div>
  );
};

export default Export;
