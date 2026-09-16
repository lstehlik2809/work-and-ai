// O*NET job families use the first two digits of the SOC occupation code.
// Official names: https://www.onetonline.org/find/family?f=0
export const OCCUPATION_FAMILIES = [
  {code: '17', name: 'Architecture and Engineering'},
  {code: '27', name: 'Arts, Design, Entertainment, Sports, and Media'},
  {code: '37', name: 'Building and Grounds Cleaning and Maintenance'},
  {code: '13', name: 'Business and Financial Operations'},
  {code: '21', name: 'Community and Social Service'},
  {code: '15', name: 'Computer and Mathematical'},
  {code: '47', name: 'Construction and Extraction'},
  {code: '25', name: 'Educational Instruction and Library'},
  {code: '45', name: 'Farming, Fishing, and Forestry'},
  {code: '35', name: 'Food Preparation and Serving Related'},
  {code: '29', name: 'Healthcare Practitioners and Technical'},
  {code: '31', name: 'Healthcare Support'},
  {code: '49', name: 'Installation, Maintenance, and Repair'},
  {code: '23', name: 'Legal'},
  {code: '19', name: 'Life, Physical, and Social Science'},
  {code: '11', name: 'Management'},
  {code: '55', name: 'Military Specific'},
  {code: '43', name: 'Office and Administrative Support'},
  {code: '39', name: 'Personal Care and Service'},
  {code: '51', name: 'Production'},
  {code: '33', name: 'Protective Service'},
  {code: '41', name: 'Sales and Related'},
  {code: '53', name: 'Transportation and Material Moving'},
] as const;

export function occupationFamilyCode(code: string): string {
  return code.slice(0, 2);
}

export function occupationFamilyName(code: string): string {
  return OCCUPATION_FAMILIES.find(family => family.code === occupationFamilyCode(code))?.name ?? 'Unknown job family';
}

/** One entry per canonical BLS occupation, including occupations without skill ratings. */
export function familyOccupationMembers<T extends {code: string; title: string}>(occupations: readonly T[], familyCode: string): T[] {
  return [...new Map(occupations.filter(occupation => occupationFamilyCode(occupation.code) === familyCode)
    .map(occupation => [occupation.code, occupation])).values()]
    .sort((a, b) => a.title.localeCompare(b.title) || a.code.localeCompare(b.code));
}

export function representedOccupationFamilies(occupations: readonly {code: string}[]) {
  const represented = new Set(occupations.map(occupation => occupationFamilyCode(occupation.code)));
  return OCCUPATION_FAMILIES.filter(family => represented.has(family.code));
}
