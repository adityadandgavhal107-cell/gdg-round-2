// Mock guests pre-populating the hotel for demo purposes
export const SPECIAL_NEEDS_OPTIONS = ['none', 'wheelchair', 'visual_impairment', 'hearing_impairment', 'elderly', 'children', 'medical'];

export function calculatePriority(guest) {
  if (guest.specialNeeds.includes('wheelchair') || guest.specialNeeds.includes('medical')) return 1;
  if (guest.specialNeeds.includes('visual_impairment') || guest.specialNeeds.includes('hearing_impairment')) return 1;
  if (guest.age >= 70 || guest.specialNeeds.includes('elderly')) return 2;
  if (guest.age <= 12 || guest.specialNeeds.includes('children')) return 2;
  if (guest.age >= 60) return 3;
  return 4;
}

export const PRIORITY_LABELS = {
  1: { label: 'P1 — Critical', color: '#ff2d2d', bg: 'rgba(255,45,45,0.15)' },
  2: { label: 'P2 — High', color: '#ff6b1a', bg: 'rgba(255,107,26,0.15)' },
  3: { label: 'P3 — Medium', color: '#ffd700', bg: 'rgba(255,215,0,0.15)' },
  4: { label: 'P4 — Standard', color: '#00ff88', bg: 'rgba(0,255,136,0.15)' },
};

const mockGuestData = [
  { id: 'g001', name: 'Priya Sharma', age: 72, specialNeeds: ['elderly'], roomId: '101', contact: '9876543210' },
  { id: 'g002', name: 'Rajan Mehta', age: 45, specialNeeds: ['none'], roomId: '102', contact: '9876543211' },
  { id: 'g003', name: 'Aisha Khan', age: 8, specialNeeds: ['children'], roomId: '103', contact: '9876543212' },
  { id: 'g004', name: 'Vikram Nair', age: 34, specialNeeds: ['wheelchair'], roomId: '104', contact: '9876543213' },
  { id: 'g005', name: 'Sunita Patel', age: 55, specialNeeds: ['none'], roomId: '105', contact: '9876543214' },
  { id: 'g006', name: 'Arjun Singh', age: 28, specialNeeds: ['none'], roomId: '106', contact: '9876543215' },
  { id: 'g007', name: 'Meena Rao', age: 67, specialNeeds: ['elderly', 'medical'], roomId: '201', contact: '9876543216' },
  { id: 'g008', name: 'Dev Kapoor', age: 41, specialNeeds: ['none'], roomId: '202', contact: '9876543217' },
  { id: 'g009', name: 'Fatima Ali', age: 32, specialNeeds: ['none'], roomId: '203', contact: '9876543218' },
  { id: 'g010', name: 'Rajesh Kumar', age: 58, specialNeeds: ['none'], roomId: '301', contact: '9876543219' },
  { id: 'g011', name: 'Anjali Verma', age: 9, specialNeeds: ['children'], roomId: '302', contact: '9876543220' },
  { id: 'g012', name: 'Suresh Iyer', age: 75, specialNeeds: ['elderly', 'visual_impairment'], roomId: '303', contact: '9876543221' },
  { id: 'g013', name: 'Pooja Gupta', age: 26, specialNeeds: ['none'], roomId: '401', contact: '9876543222' },
  { id: 'g014', name: 'Karan Shah', age: 38, specialNeeds: ['none'], roomId: '402', contact: '9876543223' },
  { id: 'g015', name: 'Nisha Joshi', age: 44, specialNeeds: ['hearing_impairment'], roomId: '501', contact: '9876543224' },
  { id: 'g016', name: 'Amit Tiwari', age: 33, specialNeeds: ['none'], roomId: '502', contact: '9876543225' },
  { id: 'g017', name: 'Rekha Desai', age: 61, specialNeeds: ['none'], roomId: '601', contact: '9876543226' },
  { id: 'g018', name: 'Manoj Pillai', age: 47, specialNeeds: ['none'], roomId: '701', contact: '9876543227' },
  { id: 'g019', name: 'Deepa Nambiar', age: 29, specialNeeds: ['none'], roomId: '801', contact: '9876543228' },
  { id: 'g020', name: 'Rohit Aggarwal', age: 52, specialNeeds: ['medical'], roomId: '802', contact: '9876543229' },
];

export function initializeGuests() {
  return mockGuestData.map(g => ({
    ...g,
    priority: calculatePriority(g),
    checkedIn: true,
    evacuated: false,
    alertSent: false,
  }));
}
