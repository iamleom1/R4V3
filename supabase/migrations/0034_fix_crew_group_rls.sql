drop policy if exists "crew_group_members_select_member" on public.crew_group_members;
create policy "crew_group_members_select_self" on public.crew_group_members
for select to authenticated
using (profile_id = auth.uid());

drop policy if exists "crew_group_members_insert_member" on public.crew_group_members;
create policy "crew_group_members_insert_self" on public.crew_group_members
for insert to authenticated
with check (profile_id = auth.uid());

create or replace function public.list_crew_groups()
returns table (
  group_id uuid,
  title text,
  created_at timestamptz,
  member_count bigint,
  other_member_names text[],
  last_message_body text,
  last_message_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with my_groups as (
    select cgm.group_id
    from public.crew_group_members cgm
    where cgm.profile_id = auth.uid()
  ),
  latest_messages as (
    select distinct on (cgm.group_id)
      cgm.group_id,
      cgm.body,
      cgm.created_at
    from public.crew_group_messages cgm
    join my_groups mg on mg.group_id = cgm.group_id
    where cgm.deleted_at is null
    order by cgm.group_id, cgm.created_at desc
  ),
  member_rollup as (
    select
      cgm.group_id,
      count(*) as member_count,
      array_remove(array_agg(case when cgm.profile_id <> auth.uid() then p.display_name else null end), null) as other_member_names
    from public.crew_group_members cgm
    join public.profiles p on p.id = cgm.profile_id
    join my_groups mg on mg.group_id = cgm.group_id
    group by cgm.group_id
  )
  select
    cg.id as group_id,
    cg.title,
    cg.created_at,
    coalesce(mr.member_count, 0) as member_count,
    coalesce(mr.other_member_names, array[]::text[]) as other_member_names,
    lm.body as last_message_body,
    lm.created_at as last_message_at
  from public.crew_groups cg
  join my_groups mg on mg.group_id = cg.id
  left join member_rollup mr on mr.group_id = cg.id
  left join latest_messages lm on lm.group_id = cg.id
  order by coalesce(lm.created_at, cg.created_at) desc;
$$;

grant execute on function public.list_crew_groups() to authenticated;
