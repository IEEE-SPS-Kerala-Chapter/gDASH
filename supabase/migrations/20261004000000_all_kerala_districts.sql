-- Accept all 14 districts of Kerala (2026-10-02). The rules say the
-- hackathon is open to all of Kerala; teams_district_check only allowed 6.
-- Widening the list can't invalidate any existing row. Mirrors
-- KERALA_DISTRICTS in lib/validations/team.ts.

alter table teams drop constraint if exists teams_district_check;
alter table teams add constraint teams_district_check check (district in (
  'Alappuzha',
  'Ernakulam',
  'Idukki',
  'Kannur',
  'Kasaragod',
  'Kollam',
  'Kottayam',
  'Kozhikode',
  'Malappuram',
  'Palakkad',
  'Pathanamthitta',
  'Thiruvananthapuram',
  'Thrissur',
  'Wayanad'
));
