update storage.buckets
set public = true
where id = 'profile-photos';

drop policy if exists "profile_photos_public_read" on storage.objects;
create policy "profile_photos_public_read" on storage.objects
for select
to public
using (bucket_id = 'profile-photos');
