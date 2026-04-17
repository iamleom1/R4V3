insert into public.events (
  id,
  title,
  venue_name,
  city,
  region,
  country,
  starts_at,
  ends_at,
  genre_tags,
  source_primary
)
values
  (
    '2ad20b45-2f1b-4cb5-b36f-97e5b4317b01',
    'TRINITY presents Vieze Asbak Day 2',
    '1720',
    'Los Angeles',
    'CA',
    'US',
    '2026-03-20T04:00:00Z',
    '2026-03-20T09:00:00Z',
    array['Techno', 'Hard Techno', 'Warehouse'],
    'manual'
  ),
  (
    '2ad20b45-2f1b-4cb5-b36f-97e5b4317b02',
    'girlsnight LA',
    '1710 N Las Palmas Ave',
    'Los Angeles',
    'CA',
    'US',
    '2026-03-21T04:30:00Z',
    null,
    array['Club', 'Dance', 'Underground'],
    'manual'
  ),
  (
    '2ad20b45-2f1b-4cb5-b36f-97e5b4317b03',
    'Familiar Faces: LA',
    'Don Quixote',
    'Los Angeles',
    'CA',
    'US',
    '2026-03-21T04:00:00Z',
    '2026-03-21T09:00:00Z',
    array['Hip-Hop', 'R&B', 'Amapiano'],
    'manual'
  ),
  (
    '2ad20b45-2f1b-4cb5-b36f-97e5b4317b04',
    'Bad Habits - House // Tech-House (18+)',
    'THE VYBE LA',
    'Los Angeles',
    'CA',
    'US',
    '2026-03-20T05:00:00Z',
    '2026-03-20T08:30:00Z',
    array['House', 'Tech House', 'Rave'],
    'manual'
  ),
  (
    '2ad20b45-2f1b-4cb5-b36f-97e5b4317b05',
    'WHITE LIES INFLUENCER PARTY FT. EDWIN RG',
    'Location revealed day-of',
    'Los Angeles',
    'CA',
    'US',
    '2026-03-22T05:00:00Z',
    '2026-03-22T10:00:00Z',
    array['Party', 'Open Format', 'Club'],
    'manual'
  ),
  (
    '2ad20b45-2f1b-4cb5-b36f-97e5b4317b06',
    'CLUB RAGE IN A MANSION',
    'Location revealed day-of',
    'Los Angeles',
    'CA',
    'US',
    '2026-03-21T06:00:00Z',
    '2026-03-21T10:00:00Z',
    array['Club', 'Party', 'Mansion'],
    'manual'
  ),
  (
    '2ad20b45-2f1b-4cb5-b36f-97e5b4317b07',
    'AFTERS 3-19',
    'Address sent via text and email',
    'Los Angeles',
    'CA',
    'US',
    '2026-03-20T06:00:00Z',
    null,
    array['House', 'Tech House', 'Minimal'],
    'manual'
  )
on conflict (id) do update
set
  title = excluded.title,
  venue_name = excluded.venue_name,
  city = excluded.city,
  region = excluded.region,
  country = excluded.country,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  genre_tags = excluded.genre_tags,
  source_primary = excluded.source_primary;
