import { DocumentStudentOverrides, Student } from '../types';

export const applyDocumentStudentOverrides = (
  student: Student,
  overrides: DocumentStudentOverrides | undefined,
  treatmentAreaFallback?: string
): Student => ({
  ...student,
  name: overrides?.name ?? student.name,
  birthDate: overrides?.birthDate ?? student.birthDate,
  school: overrides?.school ?? student.school,
  disabilityType: overrides?.disabilityType ?? student.disabilityType,
  treatmentArea: overrides?.treatmentArea ?? treatmentAreaFallback ?? student.treatmentArea,
  therapistName: overrides?.therapistName ?? student.therapistName,
  voucherArea: overrides?.voucherArea ?? student.voucherArea,
  schedule: {
    ...student.schedule,
    day: overrides?.scheduleDay ?? student.schedule.day,
    time: overrides?.scheduleTime ?? student.schedule.time,
    frequency: overrides?.scheduleFrequency ?? student.schedule.frequency,
  },
});
