import { Student } from '../types';

export const mockStudents: Student[] = [
  {
    id: '1',
    name: '차윤우',
    birthDate: '2018.01.10',
    school: '금사초등학교',
    disabilityType: '자폐성장애',
    treatmentArea: '언어치료',
    schedule: {
      day: '목요일',
      time: '14:50-15:30',
      frequency: '1'
    },
    startDate: '2021.02',
    therapistName: '서은경',
    voucherArea: '언어치료',
    paymentDates: [
      '2026-04-02',
      '2026-04-09',
      '2026-04-16',
      '2026-04-23'
    ]
  },
  {
    id: '2',
    name: '김민준',
    birthDate: '2019.05.15',
    school: '해운대유치원',
    disabilityType: '지적장애',
    treatmentArea: '미술치료',
    schedule: {
      day: '화요일',
      time: '16:00-16:40',
      frequency: '1'
    },
    startDate: '2023.03',
    therapistName: '이하늘',
    voucherArea: '발달재활',
    paymentDates: [
      '2026-04-07',
      '2026-04-14',
      '2026-04-21',
      '2026-04-28'
    ]
  }
];
